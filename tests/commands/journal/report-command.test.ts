import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stripVTControlCharacters } from "node:util";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installStartup } from "../../../src/commands/cli/startup.js";
import { journalModule } from "../../../src/commands/journal/journal-module.js";
import { stopLogSession } from "../../../src/commands/journal/log-session.js";
import { reportRequestOf, runReport } from "../../../src/commands/journal/report-command.js";
import { utcDay } from "../../../src/core/log/file-sink.js";
import { REPORT_MESSAGES } from "../../../src/ui/text/report-labels.js";
import { scanEvent, updateEvent, writeHistoryShards } from "../../support/history-fixtures.js";

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

describe("gup report", () => {
  it("prints the period's activity as text charts by default", async () => {
    expect(await runReport({})).toBe(0);

    const text = output(stdout);
    expect(text).toMatch(/^gup — activité · 12 derniers mois\n/);
    expect(text).toContain("1 mise à jour · 50 % réussies · 1 paquet · 1 échec");
    expect(text).toContain("Mises à jour réussies par jour");
    expect(output(stderr)).toBe("");
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

    expect(await runReport({ out })).toBe(0);

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
    expect(await runReport({ since: "2020-01-01", until: "2020-03-31" })).toBe(0);

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

    expect(await runReport({ since: "all" })).toBe(0);
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
    expect(reportRequestOf(options, new Date("2026-10-03T12:00:00Z"))).toBe(message);
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
