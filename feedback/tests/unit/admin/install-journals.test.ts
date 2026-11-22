import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type {
  InstallSummary, StoredHistoryRecord, StoredLogRecord,
} from "../../../src/ports/install-reader.js";
import { AdminSession } from "../../support/admin-session.js";
import { createTestApp, type TestApp } from "../../support/test-app.js";

const INSTALL_ID = "8c1d4f2e-3b5a-4c6d-8e7f-9a0b1c2d3e4f";
const OTHER_INSTALL_ID = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
const BASE = `/admin/installs/${INSTALL_ID}`;
const RUN_A = "run-a";
const RUN_B = "run/b c";
const HOSTILE = `"'><script>alert(1)</script>`;
const AT = (minute: number) => new Date(Date.UTC(2026, 10, 20, 8, minute));
const RECEIVED = new Date(Date.UTC(2026, 10, 1));

const INSTALL: InstallSummary = {
  id: INSTALL_ID, gupVersion: "0.6.0", platform: "win32", arch: "x64", node: "26.1.0",
  locale: "fr", firstSeenAt: AT(0), lastSeenAt: AT(59), historyCount: 4, logCount: 5,
  feedbackCount: 1,
};

type Owned<T> = T & { installId: string; receivedAt?: Date };

function update(id: number, minute: number, status: string) {
  return updateIn(RUN_A, { id, minute, status });
}

function updateIn(runId: string, { id, minute, status }: { id: number; minute: number; status: string }) {
  return {
    installId: INSTALL_ID, id, ts: AT(minute), runId, kind: "update", status,
    data: { kind: "update", providerId: "winget", packageId: `pkg-${id}`, status },
  } satisfies Owned<StoredHistoryRecord>;
}

function log(id: number, at: { minute: number; levelRank: number }, data: Record<string, unknown>) {
  const { minute, levelRank } = at;
  return {
    installId: INSTALL_ID, id, ts: AT(minute), runId: RUN_A, levelRank, event: "update.step",
    data: { event: "update.step", ...data },
  } satisfies Owned<StoredLogRecord>;
}

let ctx: TestApp;
let admin: AdminSession;

beforeEach(async () => {
  ctx = await createTestApp();
  const { journals } = ctx;
  journals.installs.push(INSTALL, { ...INSTALL, id: OTHER_INSTALL_ID });
  journals.history.push(
    update(1, 10, "success"),
    update(2, 12, "failed"),
    { ...updateIn(RUN_B, { id: 3, minute: 20, status: "skipped" }), receivedAt: RECEIVED },
    {
      installId: INSTALL_ID, id: 4, ts: AT(5), runId: RUN_A, kind: "scan", status: null,
      data: { kind: "scan", outdated: 2, providers: [{ providerId: "npm", error: HOSTILE }] },
    },
    { ...update(5, 30, "failed"), installId: OTHER_INSTALL_ID, runId: "other-run" },
  );
  journals.logs.push(
    log(1, { minute: 4, levelRank: 2 }, { message: "scan started" }),
    log(2, { minute: 12, levelRank: 0 }, { exitCode: 1603, path: "C:\\Program Files\\Git" }),
    log(3, { minute: 12, levelRank: 1 }, { message: "100% done_now" }),
    log(4, { minute: 13, levelRank: 3 }, { secret: HOSTILE }),
    log(5, { minute: 14, levelRank: 0 }, { message: "Disk FULL" }),
  );
  await ctx.feedback.create({
    kind: "bug", title: "Linked bug", message: "It broke.", email: null,
    installId: INSTALL_ID, gupVersion: null, platform: null, locale: null,
  });
  admin = await AdminSession.open(ctx.app);
});

afterEach(async () => {
  await ctx.app.close();
});

async function page(query = ""): Promise<string> {
  const response = await admin.get(`${BASE}${query}`);
  expect(response.statusCode).toBe(200);
  return response.body;
}

function section(body: string, id: string): string {
  const start = body.indexOf(`<section class="section" id="${id}"`);
  return body.slice(start, body.indexOf("</section>", start));
}

describe("install facts", () => {
  it("shows counts, covered period, runs and the retention rule with its next purge", async () => {
    const body = await page();
    expect(body).toContain("4 éléments");
    expect(body).toContain("5 lignes");
    expect(body).toContain("2 exécutions");
    expect(body).toContain("90 jours après réception");
    expect(body).toContain("reçu le 1 nov. 2026, 01:00, part vers le 30 janv. 2027");
    expect(body).toContain(`href="${BASE}/export"`);
  });
});

describe("install history", () => {
  it("lists every kind and status, newest first, each with its whole data and run", async () => {
    const history = section(await page(), "historique");
    expect(history.indexOf("pkg-3")).toBeLessThan(history.indexOf("pkg-2"));
    expect(history.indexOf("pkg-2")).toBeLessThan(history.indexOf("pkg-1"));
    expect(history).toContain("2 paquets en retard");
    expect(history).toContain("Données complètes");
    expect(history).toContain(`href="${BASE}/runs/${encodeURIComponent(RUN_B)}"`);
    expect(history).not.toContain("<script>");
    expect(history).not.toContain("pkg-5");
  });

  it("filters by kind and by status, counting each pill under the other filter", async () => {
    const failed = section(await page("?kind=update&status=failed"), "historique");
    expect(failed).toContain("pkg-2");
    expect(failed).not.toContain("pkg-1");
    expect(failed).toContain("1 élément sous ces filtres");
    expect(failed).toMatch(/status=failed[^"]*#historique"\s+aria-current="page"/);
    expect(failed).toMatch(/>Analyses <span class="pill__count">0<\/span>/);
    expect(failed).toMatch(/>Mises à jour <span class="pill__count">1<\/span>/);
    const scans = section(await page("?kind=scan"), "historique");
    expect(scans).toMatch(/>Tous <span class="pill__count">1<\/span>/);
  });

  it("says what is missing and how out when filters match nothing", async () => {
    const empty = section(await page("?kind=scan&status=failed"), "historique");
    expect(empty).toContain("Aucun élément d’historique ne correspond à ces filtres.");
    expect(empty).toContain("Retirer les filtres");
  });

  it("ignores unknown filter values", async () => {
    const history = section(await page("?kind=nope&status=nope&hpage=-3"), "historique");
    expect(history).toContain("4 éléments sous ces filtres");
  });

  it("keeps the log's level and search in every history link, and the reverse", async () => {
    const body = await page("?status=failed&level=info&q=done");
    const history = section(body, "historique");
    expect(history).toMatch(/href="[^"]*kind=scan&amp;status=failed&amp;level=info&amp;q=done#/);
    const log = section(body, "journal");
    expect(log).toMatch(/href="[^"]*status=failed&amp;level=error&amp;q=done#journal"/);
    expect(log).toContain(`<input type="hidden" name="status" value="failed">`);
  });
});

describe("install log search", () => {
  it("shows warnings and errors by default, newest first", async () => {
    const log = section(await page(), "journal");
    expect(log).toContain("Disk FULL");
    expect(log).toContain("100% done_now");
    expect(log).not.toContain("scan started");
    expect(log.indexOf("Disk FULL")).toBeLessThan(log.indexOf("1603"));
  });

  it("matches a value of the data, ignoring case, at the level chosen", async () => {
    const log = section(await page("?q=disk%20full"), "journal");
    expect(log).toContain("Disk FULL");
    expect(log).not.toContain("1603");
    expect(log).toContain("1 entrée trouvée pour « disk full »");
    expect(section(await page("?q=disk&level=error"), "journal")).toContain("Disk FULL");
  });

  it("matches the event name, a key, a number and a Windows path", async () => {
    expect(section(await page("?q=update.step"), "journal")).toContain("3 entrées trouvées");
    expect(section(await page("?q=exitCode"), "journal")).toContain("1603");
    expect(section(await page("?q=1603"), "journal")).toContain("1 entrée trouvée");
    const path = encodeURIComponent("Program Files\\Git");
    expect(section(await page(`?q=${path}`), "journal")).toContain("1 entrée trouvée");
  });

  it("takes % and _ literally and escapes the search where it shows it", async () => {
    expect(section(await page("?q=100%25"), "journal")).toContain("1 entrée trouvée");
    expect(section(await page("?q=e_n"), "journal")).toContain("1 entrée trouvée");
    expect(section(await page("?q=0%25"), "journal")).toContain("1 entrée trouvée");
    const hostile = section(await page(`?level=trace&q=${encodeURIComponent(HOSTILE)}`), "journal");
    expect(hostile).not.toContain("<script>");
    expect(hostile).toContain("1 entrée trouvée");
  });

  it("collapses spaces and cuts the search at 100 characters", async () => {
    const long = "x".repeat(150);
    const body = section(await page(`?q=${long}`), "journal");
    expect(body).toContain(`« ${"x".repeat(100)} »`);
    expect(body).not.toContain("x".repeat(101));
    expect(section(await page("?q=%20%20disk%20%20%20full%20"), "journal"))
      .toContain("pour « disk full »");
  });

  it("offers a way out when the search finds nothing", async () => {
    const log = section(await page("?status=failed&q=nothing-like-this"), "journal");
    expect(log).toContain("Aucune entrée ne correspond à cette recherche.");
    expect(log).toMatch(/href="[^"]*status=failed&amp;level=warn#journal">Effacer la recherche/);
  });
});

describe("run view", () => {
  it("merges the run's history and log oldest first, logs first at equal times", async () => {
    const response = await admin.get(`${BASE}/runs/${RUN_A}`);
    expect(response.statusCode).toBe(200);
    const body = response.body;
    expect(body).toContain("scan started");
    expect(body).toContain("8 éléments");
    const order = ["scan started", "pkg-1", "1603", "pkg-2", "Disk FULL"]
      .map((text) => body.indexOf(text));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(body.indexOf("1603")).toBeLessThan(body.indexOf("pkg-2"));
    expect(body).not.toContain("<script>");
    expect(body).toContain(`href="${BASE}#historique"`);
  });

  it("finds a run whose ID needs encoding", async () => {
    const response = await admin.get(`${BASE}/runs/${encodeURIComponent(RUN_B)}`);
    expect(response.statusCode).toBe(200);
    expect(response.body).toContain("pkg-3");
  });

  it("answers 404 for an unknown, overlong or foreign run", async () => {
    expect((await admin.get(`${BASE}/runs/unknown`)).statusCode).toBe(404);
    expect((await admin.get(`${BASE}/runs/${"r".repeat(65)}`)).statusCode).toBe(404);
    expect((await admin.get(`${BASE}/runs/other-run`)).statusCode).toBe(404);
    const unknownInstall = "/admin/installs/00000000-0000-4000-8000-000000000000/runs/run-a";
    expect((await admin.get(unknownInstall)).statusCode).toBe(404);
  });
});

describe("install export", () => {
  it("streams everything as JSON Lines, as an attachment never cached", async () => {
    const response = await admin.get(`${BASE}/export`);
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toBe("application/x-ndjson; charset=utf-8");
    expect(response.headers["content-disposition"])
      .toBe(`attachment; filename="gup-install-${INSTALL_ID}.jsonl"`);
    expect(response.headers["cache-control"]).toBe("no-store");
    const lines = response.body.trimEnd().split("\n").map((line) => JSON.parse(line));
    expect(lines.map((line) => line.type)).toEqual([
      "export", "install", "feedback",
      "history", "history", "history", "history",
      "log", "log", "log", "log", "log",
    ]);
    expect(lines[0]).toMatchObject({ format: "gup-install-export", version: 1 });
    expect(lines[1]).toMatchObject({ id: INSTALL_ID, gupVersion: "0.6.0" });
    expect(lines[3].id).toBe(4);
    expect(lines[4].data).toMatchObject({ packageId: "pkg-1" });
    expect(lines[10].data).toMatchObject({ secret: HOSTILE });
  });

  it("is reserved to a signed-in maintainer", async () => {
    const response = await ctx.app.inject({ method: "GET", url: `${BASE}/export` });
    expect(response.statusCode).toBe(303);
    expect(response.body).not.toContain(INSTALL_ID);
  });

  it("answers 404 for an unknown install", async () => {
    const unknown = "/admin/installs/00000000-0000-4000-8000-000000000000/export";
    expect((await admin.get(unknown)).statusCode).toBe(404);
  });
});
