import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { collectSharedJournals, type JournalItem } from "../../../src/core/export/shared-journals.js";
import type { ClientInfo } from "../../../src/core/feedback/client-info.js";
import type { FetchLike } from "../../../src/core/feedback/feedback-client.js";
import {
  loadInstallIdentity,
  type InstallIdentity,
} from "../../../src/core/feedback/install-identity.js";
import { uploadJournals, type UploaderDeps } from "../../../src/core/feedback/journal-uploader.js";
import { UploadCursorFile } from "../../../src/core/feedback/upload-cursor.js";
import { isSignedBy } from "../../support/feedback-signature.js";
import { updateEvent, writeHistoryShards } from "../../support/history-fixtures.js";
import { useTempDirs } from "../../support/temp-dirs.js";

const CLIENT: ClientInfo = {
  gupVersion: "0.6.0",
  platform: "win32",
  arch: "x64",
  node: "26.10.0",
  locale: "fr",
};
const URL_LOGS = "https://svc.example.test/api/installs/x/logs";
const NOW = Date.parse("2026-11-20T12:00:00.000Z");
const DAY_MS = 86_400_000;

interface Sent {
  readonly url: string;
  readonly init: RequestInit;
  readonly body: { history: unknown[]; logs: { ts: string; event: string }[] } & Record<
    string,
    unknown
  >;
}

/** A fake service: answers `statuses` in turn (202 once they run out), records each request. */
function fakeService(statuses: number[] = []) {
  const sent: Sent[] = [];
  const fetch = vi.fn<FetchLike>(async (url, init) => {
    sent.push({ url, init, body: JSON.parse(String(init.body)) });
    return { status: statuses.shift() ?? 202 };
  });
  return { fetch, sent };
}

function logItems(count: number, from = NOW - DAY_MS, stepMs = 1_000): JournalItem[] {
  return Array.from({ length: count }, (_, index) => {
    const ts = new Date(from + index * stepMs).toISOString();
    const record = { v: 1, ts, level: "info", event: `run.step-${index}`, runId: "r", pid: 1 };
    return { stream: "logs", ts, record } as JournalItem;
  });
}

describe("uploadJournals", () => {
  const tempDir = useTempDirs();
  let identity: InstallIdentity;

  beforeAll(async () => {
    identity = loadInstallIdentity(await tempDir("gup-identity-"))!;
  });

  async function deps(over: Partial<UploaderDeps> & { items?: JournalItem[] }) {
    const cursor = new UploadCursorFile(await tempDir("gup-cursor-"));
    const items = over.items ?? [];
    return {
      identity,
      cursor,
      url: URL_LOGS,
      client: CLIENT,
      collect: async () => items,
      isGranted: () => true,
      now: () => NOW,
      ...over,
    } satisfies UploaderDeps;
  }

  it("sends signed batches of at most 1000 items", async () => {
    const service = fakeService();

    const summary = await uploadJournals(await deps({ items: logItems(2_500), fetch: service.fetch }));

    expect(summary).toEqual({ batches: 3, stop: "done" });
    expect(service.sent.map(({ body }) => body.logs.length)).toEqual([1_000, 1_000, 500]);
    const first = service.sent[0]!;
    const headers = first.init.headers as Record<string, string>;
    expect(first.url).toBe(URL_LOGS);
    expect(
      isSignedBy({
        authorization: headers["authorization"]!,
        method: "POST",
        url: URL_LOGS,
        body: String(first.init.body),
      }),
    ).toBe(true);
  });

  it("builds a batch shaped like the contract's example", async () => {
    const example = JSON.parse(
      await readFile(join(process.cwd(), "feedback/contract/log-batch.v1.example.json"), "utf8"),
    ) as { client: object };
    const service = fakeService();

    await uploadJournals(await deps({ items: logItems(1), fetch: service.fetch }));

    const body = service.sent[0]!.body;
    expect(Object.keys(body).sort()).toEqual(Object.keys(example).sort());
    expect(Object.keys(body.client as object).sort()).toEqual(Object.keys(example.client).sort());
  });

  it("moves the cursor past a batch only once the service acknowledged it", async () => {
    const service = fakeService([202, 500]);
    const items = logItems(1_500);
    const uploader = await deps({ items, fetch: service.fetch });

    const summary = await uploadJournals(uploader);

    expect(summary).toEqual({ batches: 1, stop: "refused" });
    expect(uploader.cursor.read()).toEqual({
      history: null,
      logs: { at: items[999]!.ts, count: 1 },
      lastUploadAt: new Date(NOW).toISOString(),
    });
  });

  it.each([400, 413])("drops a batch answered %i, moves past it, and goes on", async (status) => {
    const service = fakeService([status]);
    const items = logItems(1_500);
    const uploader = await deps({ items, fetch: service.fetch });

    const summary = await uploadJournals(uploader);

    expect(summary).toEqual({ batches: 1, stop: "done" });
    expect(service.fetch).toHaveBeenCalledTimes(2);
    expect(uploader.cursor.read().logs).toEqual({ at: items[1_499]!.ts, count: 1 });
  });

  it("does not record a dropped batch as an upload", async () => {
    const uploader = await deps({ items: logItems(3), fetch: fakeService([400]).fetch });

    await uploadJournals(uploader);

    expect(uploader.cursor.read().lastUploadAt).toBeNull();
  });

  it.each([429, 500, 503, 401])("keeps a batch answered %i for a later run", async (status) => {
    const uploader = await deps({ items: logItems(10), fetch: fakeService([status]).fetch });

    expect(await uploadJournals(uploader)).toEqual({ batches: 0, stop: "refused" });
    expect(uploader.cursor.read().logs).toBeNull();
  });

  it("leaves the cursor untouched when the service cannot be reached", async () => {
    const fetch = vi.fn<FetchLike>(() => Promise.reject(new TypeError("fetch failed")));
    const uploader = await deps({ items: logItems(10), fetch });

    expect(await uploadJournals(uploader)).toEqual({ batches: 0, stop: "refused" });
    expect(uploader.cursor.read().logs).toBeNull();
  });

  it("stops at its time budget, leaving the rest for a later run", async () => {
    let clock = NOW;
    const fetch = vi.fn<FetchLike>(async () => {
      clock += 1_500;
      return { status: 202 };
    });
    const uploader = await deps({
      items: logItems(5_000),
      fetch,
      now: () => clock,
      limits: { budgetMs: 4_000, requestTimeoutMs: 2_500 },
    });

    expect(await uploadJournals(uploader)).toEqual({ batches: 3, stop: "budget" });
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("sends at most maxBatches batches in one run", async () => {
    const service = fakeService();
    const uploader = await deps({
      items: logItems(4_500),
      fetch: service.fetch,
      limits: { maxBatches: 2 },
    });

    expect(await uploadJournals(uploader)).toEqual({ batches: 2, stop: "budget" });
    expect(service.fetch).toHaveBeenCalledTimes(2);
  });

  it("stops before its next batch once sharing is turned off", async () => {
    const service = fakeService();
    let isGranted = true;
    service.fetch.mockImplementation(async () => {
      isGranted = false;
      return { status: 202 };
    });
    const uploader = await deps({
      items: logItems(2_500),
      fetch: service.fetch,
      isGranted: () => isGranted,
    });

    expect(await uploadJournals(uploader)).toEqual({ batches: 1, stop: "withdrawn" });
    expect(service.fetch).toHaveBeenCalledTimes(1);
  });

  it("loses no record sharing a millisecond across a batch cut, and sends none twice", async () => {
    const tied = logItems(1_200, NOW - DAY_MS, 0);
    const later = logItems(3, NOW - DAY_MS + 1_000);
    const all = [...tied, ...later];
    const uploader = await deps({ items: all });
    const firstRun = fakeService([202, 500]);

    await uploadJournals({ ...uploader, fetch: firstRun.fetch });
    expect(uploader.cursor.read().logs).toEqual({ at: tied[0]!.ts, count: 1_000 });

    const secondRun = fakeService();
    const collect: UploaderDeps["collect"] = async (query) =>
      all.filter((item) => Date.parse(item.ts) >= query.logsFrom.getTime());
    await uploadJournals({ ...uploader, collect, fetch: secondRun.fetch });

    const resent = secondRun.sent.flatMap(({ body }) => body.logs.map((record) => record.event));
    expect(resent).toEqual(all.slice(1_000).map((item) => (item.record as { event: string }).event));
    expect(uploader.cursor.read().logs).toEqual({ at: later[2]!.ts, count: 1 });
  });

  it("posts nothing when there is nothing new since the cursor", async () => {
    const items = logItems(3);
    const uploader = await deps({ items });
    await uploadJournals({ ...uploader, fetch: fakeService().fetch });
    const again = fakeService();
    const collect: UploaderDeps["collect"] = async (query) =>
      items.filter((item) => Date.parse(item.ts) >= query.logsFrom.getTime());

    expect(await uploadJournals({ ...uploader, collect, fetch: again.fetch })).toEqual({
      batches: 0,
      stop: "done",
    });
    expect(again.fetch).not.toHaveBeenCalled();
  });

  it("redacts the history, and reaches back 30 days at most on a first upload", async () => {
    const historyDir = await tempDir("gup-history-");
    const message = `install failed, see ${join(homedir(), "AppData", "Local", "Temp", "x.log")}`;
    await writeHistoryShards(historyDir, [
      updateEvent("winget", "Old.Package", { ts: new Date(NOW - 40 * DAY_MS).toISOString() }),
      updateEvent("winget", "Git.Git", {
        ts: new Date(NOW - DAY_MS).toISOString(),
        status: "failed",
        message,
      }),
    ]);
    const service = fakeService();
    const collect: UploaderDeps["collect"] = (query) =>
      collectSharedJournals({ ...query, dirs: { history: historyDir, logs: null } });

    await uploadJournals(await deps({ collect, fetch: service.fetch }));

    const history = service.sent[0]!.body.history as { packageId: string; message?: string }[];
    expect(history.map((event) => event.packageId)).toEqual(["Git.Git"]);
    expect(history[0]?.message).toContain("~");
    expect(history[0]?.message).not.toContain(homedir());
  });
});
