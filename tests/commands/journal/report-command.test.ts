import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { stripVTControlCharacters } from "node:util";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";
import { installStartup } from "../../../src/commands/cli/startup.js";
import { journalModule } from "../../../src/commands/journal/journal-module.js";
import { stopLogSession } from "../../../src/commands/journal/log-session.js";
import { reportRequestOf, runReport } from "../../../src/commands/journal/report-command.js";
import { MAX_REPORT_UPDATES } from "../../../src/core/export/report-model.js";
import { utcDay } from "../../../src/core/log/file-sink.js";
import { REPORT_MESSAGES } from "../../../src/ui/text/journal/report-labels.js";
import { scanEvent, updateEvent, writeHistoryShards } from "../../support/history-fixtures.js";

// Never a real browser from a unit test (W2-4): the command path opens through this mock.
const commandOpen = vi.hoisted(() => vi.fn(async () => ({ opened: true, launcher: "explorer.exe" })));
vi.mock("../../../src/core/export/open-external.js", () => ({ openExternal: commandOpen }));

let dir: string;
let stdout: ReturnType<typeof vi.spyOn>;
let stderr: ReturnType<typeof vi.spyOn>;

const NOW = new Date();
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString();
const output = (spy: typeof stdout) =>
  stripVTControlCharacters(spy.mock.calls.map((call: unknown[]) => String(call[0])).join(""));

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "gup-report-"));
  vi.stubEnv("GUP_HISTORY_DIR", join(dir, "history"));
  vi.stubEnv("GUP_REPORT_DIR", join(dir, "reports"));
  vi.stubEnv("GUP_LOG_DIR", join(dir, "logs"));
  stdout = vi.spyOn(process.stdout, "write").mockReturnValue(true);
  stderr = vi.spyOn(process.stderr, "write").mockReturnValue(true);
  await writeHistoryShards(join(dir, "history"), [
    scanEvent({ ts: daysAgo(3), outdated: 4 }),
    updateEvent("winget", "Git.Git", { ts: daysAgo(2) }),
    updateEvent("choco", "nodejs", { ts: daysAgo(1), status: "failed", message: "=cmd|' /C calc'!A0" }),
    updateEvent("pip", "ancient", { ts: daysAgo(400) }),
  ]);
});

afterEach(() => {
  stopLogSession();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  rmSync(dir, { recursive: true, force: true });
});

/** Make stdout a terminal or not (a worker has none), until the test ends. */
function setTerminal(isTerminal: boolean): void {
  const original = Object.getOwnPropertyDescriptor(process.stdout, "isTTY");
  Object.defineProperty(process.stdout, "isTTY", { value: isTerminal, configurable: true });
  onTestFinished(() => {
    if (original) Object.defineProperty(process.stdout, "isTTY", original);
    else Reflect.deleteProperty(process.stdout, "isTTY");
  });
}

/** Pretend stdout is a terminal outside CI: where a report opens in the browser. */
function interactive(): void {
  setTerminal(true);
  vi.stubEnv("CI", "");
}

const opener = (isOpened: boolean) =>
  vi.fn(async () => ({ opened: isOpened, launcher: isOpened ? "explorer.exe" : null }));

describe("gup report (HTML)", () => {
  it("writes the HTML report to the reports directory and opens it, by default", async () => {
    interactive();
    const openExternal = opener(true);

    expect(await runReport({}, { openExternal })).toBe(0);

    const [name] = readdirSync(join(dir, "reports"));
    const path = join(dir, "reports", name ?? "");
    expect(name).toMatch(/^gup-report-\d{8}-\d{6}\.html$/);
    expect(readFileSync(path, "utf8")).toContain("<title>gup — Rapport d&#39;activité (12 derniers mois)</title>");
    expect(openExternal).toHaveBeenCalledWith(path);
    expect(output(stdout)).toBe(`${REPORT_MESSAGES.reportWritten(path)}\n${REPORT_MESSAGES.opened}\n`);
  });

  it("does not open it with --no-open, and gives its address instead", async () => {
    interactive();
    const openExternal = opener(true);
    const out = join(dir, "rapport.html");

    expect(await runReport({ out, open: false }, { openExternal })).toBe(0);

    expect(openExternal).not.toHaveBeenCalled();
    expect(output(stdout)).toContain(REPORT_MESSAGES.reportWritten(out));
    expect(output(stdout)).toContain(pathToFileURL(out).href);
  });

  it("does not open it when nobody watches: no terminal, or CI", async () => {
    setTerminal(false);
    const openExternal = opener(true);
    expect(await runReport({}, { openExternal })).toBe(0);
    interactive();
    vi.stubEnv("CI", "true");
    expect(await runReport({ out: join(dir, "ci.html") }, { openExternal })).toBe(0);

    expect(openExternal).not.toHaveBeenCalled();
  });

  it("still succeeds when the browser cannot be opened, and says how to open it", async () => {
    interactive();
    const out = join(dir, "rapport.html");

    expect(await runReport({ out }, { openExternal: opener(false) })).toBe(0);

    expect(output(stderr)).toContain(REPORT_MESSAGES.openFailed.trim());
    expect(output(stdout)).toContain(pathToFileURL(out).href);
  });

  it("leaves the report closed when the setting says so, unless --open asks for it", async () => {
    interactive();
    const openExternal = opener(true);
    const closed = { glyphs: "auto", openReport: false } as const;

    expect(await runReport({ out: join(dir, "closed.html") }, { openExternal }, closed)).toBe(0);
    expect(openExternal).not.toHaveBeenCalled();

    setTerminal(false);
    const asked = join(dir, "asked.html");
    expect(await runReport({ out: asked, open: true }, { openExternal }, closed)).toBe(0);
    expect(openExternal).toHaveBeenCalledWith(asked);
  });

  it("takes --open on the command line, even with nobody at a terminal", async () => {
    setTerminal(false);
    const out = join(dir, "open.html");

    expect(await gup("report", "--open", "--out", out)).toBe(0);

    expect(commandOpen).toHaveBeenCalledWith(out);
  });

  it("writes the HTML to standard output with --out -", async () => {
    interactive();
    const openExternal = opener(true);

    expect(await runReport({ out: "-" }, { openExternal })).toBe(0);

    expect(output(stdout)).toMatch(/^<!doctype html>/);
    expect(openExternal).not.toHaveBeenCalled();
  });

  it("says on the error output when the report details only the newest attempts", async () => {
    const events = Array.from({ length: MAX_REPORT_UPDATES + 1 }, (_unused, index) =>
      updateEvent("npm-g", `pkg-${index % 50}`, { ts: new Date(NOW.getTime() - index * 60_000).toISOString() }),
    ).reverse();
    const stats = { files: 1, lines: events.length, malformed: 0, unsupported: 0 };
    const readHistory = async () => ({ dir, events, stats });

    expect(await runReport({ out: join(dir, "big.html"), open: false }, { readHistory })).toBe(0);

    expect(output(stderr)).toContain(REPORT_MESSAGES.truncated(MAX_REPORT_UPDATES));
  }, 30_000);

  it("logs the export and the opening", async () => {
    interactive();
    vi.stubEnv("GUP_LOG_LEVEL", "info");
    const out = join(dir, "r.html");

    expect(await gup("report", "--out", out)).toBe(0);

    const log = readFileSync(join(dir, "logs", `gup-${utcDay(new Date())}.jsonl`), "utf8");
    const events = log
      .trim()
      .split(/\r?\n/)
      .map((line) => JSON.parse(line) as { event: string; data?: object });
    expect(events.find((record) => record.event === "report.export")?.data).toMatchObject({ format: "html" });
    expect(events.find((record) => record.event === "report.open")?.data).toMatchObject({ opened: true });
    expect(commandOpen).toHaveBeenCalledWith(out);
  });
});

describe("gup report", () => {
  it("prints the period's activity as text charts", async () => {
    expect(await runReport({ format: "text" })).toBe(0);

    const text = output(stdout);
    expect(text).toMatch(/^gup — activité · 12 derniers mois\n/);
    expect(text).toContain("1 mise à jour · 50 % réussies · 1 paquet · 1 échec");
    expect(text).toContain("Mises à jour réussies par jour");
    expect(output(stderr)).toBe("");
  });

  it("draws its text charts with the symbols chosen in Options", async () => {
    const preferences = (glyphs: "ascii" | "unicode") => ({ glyphs, openReport: true });

    expect(await runReport({ format: "text" }, {}, preferences("ascii"))).toBe(0);
    const ascii = output(stdout);
    stdout.mockClear();
    vi.stubEnv("GUP_ASCII", "1");
    expect(await runReport({ format: "text" }, {}, preferences("unicode"))).toBe(0);
    const unicode = output(stdout);

    expect(ascii).toContain("moins . : + * # plus");
    expect(ascii).not.toMatch(/[░▒▓█▁▂▃▄▅▆▇]/);
    expect(unicode).toMatch(/[░▒▓█]/);
  });

  it("writes JSON to standard output, the period's events only", async () => {
    expect(await runReport({ format: "JSON", since: "30d" })).toBe(0);

    const document = JSON.parse(output(stdout)) as { schema: string; events: { package_id?: string }[] };
    expect(document.schema).toBe("gup.history-export/1");
    expect(document.events.map((event) => event.package_id)).toEqual([undefined, "Git.Git", "nodejs"]);
  });

  it("writes a CSV safe to open in a spreadsheet, with the delimiter asked for", async () => {
    expect(await runReport({ format: "csv", delimiter: "tab", out: "-" })).toBe(0);

    const csv = output(stdout);
    expect(csv.split("\r\n")[0]).toBe("﻿ts\tprovider_id\tprovider\tpackage_id\tstatus\tfrom\tto\tduration_ms\tmessage\tretry\televated\trun_id\ttrigger\tschedule_id");
    expect(csv).toContain("\t'=cmd|' /C calc'!A0\t");
  });

  it("writes to --out, refuses to replace it without --force, and logs the export", async () => {
    vi.stubEnv("GUP_LOG_LEVEL", "info");
    const out = join(dir, "maj.csv");

    expect(await gup("report", "-f", "csv", "-o", out)).toBe(0);
    expect(readFileSync(out, "utf8")).toContain("Git.Git");
    expect(output(stdout)).toContain(REPORT_MESSAGES.written(out, 2));
    expect(await gup("report", "-f", "csv", "-o", out)).toBe(1);
    expect(output(stderr)).toContain("existe déjà — utilisez --force");
    expect(await gup("report", "-f", "csv", "-o", out, "--force")).toBe(0);

    const log = readFileSync(join(dir, "logs", `gup-${utcDay(new Date())}.jsonl`), "utf8");
    const exports = log
      .trim()
      .split(/\r?\n/)
      .map((line) => JSON.parse(line) as { event: string; data?: Record<string, unknown> })
      .filter((record) => record.event === "report.export");
    expect(exports).toHaveLength(2);
    expect(exports[0]!.data).toMatchObject({ format: "csv", records: 2, bytes: expect.any(Number) });
  });

  it("writes the text charts to a file as plain text", async () => {
    const out = join(dir, "activite.txt");

    expect(await runReport({ format: "text", out })).toBe(0);

    const text = readFileSync(out, "utf8");
    expect(text).toMatch(/^gup — activité · 12 derniers mois\n/);
    expect(text).not.toContain("\u001b[");
  });

  it("still writes a valid, empty document when nothing happened, and says so on stderr", async () => {
    expect(await runReport({ format: "json", since: "2020-01-01", until: "2020-01-02" })).toBe(0);

    expect((JSON.parse(output(stdout)) as { events: unknown[] }).events).toEqual([]);
    expect(output(stderr)).toContain(
      "aucune activité sur la période (depuis le 01/01/2020 jusqu'au 02/01/2020)",
    );
  });

  it("names the end of a period given --until in the report's title", async () => {
    expect(await runReport({ format: "text", since: "2020-01-01", until: "2020-03-31" })).toBe(0);

    expect(output(stdout)).toMatch(/^gup — activité · depuis le 01\/01\/2020 jusqu'au 31\/03\/2020\n/);
  });

  it("counts the history lines it could not read", async () => {
    writeFileSync(join(dir, "history", `${NOW.toISOString().slice(0, 7)}.jsonl`), "torn {\n", { flag: "a" });

    expect(await runReport({ format: "json" })).toBe(0);
    expect(output(stderr)).toContain(REPORT_MESSAGES.malformed(1));
  });

  it("charts the history around a line dated outside the calendar", async () => {
    const outOfRange = updateEvent("pip", "clock-reset", { ts: "0999-06-01T00:00:00.000Z" });
    writeFileSync(join(dir, "history", "0999-06.jsonl"), `${JSON.stringify(outOfRange)}\n`);

    expect(await runReport({ format: "text", since: "all" })).toBe(0);
    expect(output(stdout)).toContain("2 mises à jour · 67 % réussies");
    expect(output(stderr)).toContain(REPORT_MESSAGES.malformed(1));
  });

  it.each([
    [{ format: "pdf" }, REPORT_MESSAGES.badFormat("pdf")],
    [{ since: "3x" }, REPORT_MESSAGES.badSince("3x")],
    [{ until: "31/12/2026" }, REPORT_MESSAGES.badUntil("31/12/2026")],
    [{ since: "2026-06-01", until: "2026-05-01" }, REPORT_MESSAGES.untilBeforeSince],
    [{ format: "csv", delimiter: "|" }, REPORT_MESSAGES.badDelimiter("|")],
  ])("refuses %j with exit 2", async (options, message) => {
    const context = {
      now: new Date("2026-10-03T12:00:00Z"),
      preferences: { glyphs: "auto", openReport: true },
    } as const;
    expect(reportRequestOf(options, context)).toBe(message);
    expect(await runReport(options)).toBe(2);
    expect(output(stderr)).toContain(message);
  });
});

async function gup(...args: string[]): Promise<number | undefined> {
  stdout.mockClear();
  stderr.mockClear();
  const codes: (number | undefined)[] = [];
  vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
    codes.push(code);
  }) as typeof process.exit);
  const program = new Command().exitOverride();
  journalModule.register?.(program, { modules: [journalModule] });
  installStartup(program, [journalModule]);
  await program.parseAsync(["node", "gup", ...args]);
  stopLogSession();
  return codes.at(-1);
}
