import AdmZip from "adm-zip";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stripVTControlCharacters } from "node:util";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installStartup } from "../../../src/commands/cli/startup.js";
import { journalModule } from "../../../src/commands/journal/journal-module.js";
import { stopLogSession } from "../../../src/commands/journal/log-session.js";
import { utcDay } from "../../../src/core/log/file-sink.js";
import type { LogRecord } from "../../../src/core/log/types.js";

let dir: string;
let logs: string;
let stdout: ReturnType<typeof vi.spyOn>;
let stderr: ReturnType<typeof vi.spyOn>;
let exitCodes: (number | undefined)[];

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "gup-log-command-"));
  logs = join(dir, "logs");
  vi.stubEnv("GUP_LOG_DIR", logs);
  vi.stubEnv("GUP_REPORT_DIR", join(dir, "reports"));
  vi.stubEnv("GUP_LOG_LEVEL", "debug");
  exitCodes = [];
  vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
    exitCodes.push(code);
  }) as typeof process.exit);
  stdout = vi.spyOn(process.stdout, "write").mockReturnValue(true);
  stderr = vi.spyOn(process.stderr, "write").mockReturnValue(true);
});

afterEach(() => {
  stopLogSession();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  rmSync(dir, { recursive: true, force: true });
});

async function gup(...args: string[]): Promise<{ code: number | undefined; out: string; err: string }> {
  stdout.mockClear();
  stderr.mockClear();
  const program = new Command().exitOverride();
  journalModule.register?.(program, { modules: [journalModule] });
  installStartup(program, [journalModule]);
  await program.parseAsync(["node", "gup", ...args]);
  const text = (spy: typeof stdout) => stripVTControlCharacters(spy.mock.calls.map((call: unknown[]) => String(call[0])).join(""));
  return { code: exitCodes.at(-1), out: text(stdout), err: text(stderr) };
}

/** Records written `minutesAgo` before now, in today's log file. */
function seedLog(entries: readonly [minutesAgo: number, over: Partial<LogRecord>][]): string {
  mkdirSync(logs, { recursive: true });
  const file = join(logs, `gup-${utcDay(new Date())}.jsonl`);
  const lines = entries.map(([minutesAgo, over]) =>
    JSON.stringify({
      v: 1,
      ts: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
      level: "info",
      event: "scan.start",
      runId: "run",
      pid: 1,
      ...over,
    }),
  );
  writeFileSync(file, `${lines.join("\n")}\n`);
  return file;
}

describe("gup log", () => {
  beforeEach(() => {
    seedLog([
      [30, { event: "session.start", data: { command: "update", trigger: "cli" } }],
      [20, { level: "warn", event: "cmd.end", ctx: { op: "scan", providerId: "az" }, data: { cmd: "az", args: ["version"], exitCode: 1, ms: 400 } }],
      [10, { level: "debug", event: "scan.provider", data: { outdated: 2 } }],
    ]);
  });

  it("shows the newest lines by default, one readable line each", async () => {
    const { code, out } = await gup("log", "-n", "2");
    expect(code).toBe(0);
    const lines = out.trimEnd().split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/AVERT\. +cmd\.end +\[az\] az version · exit 1 · 0,4 s$/);
    expect(lines[1]).toMatch(/DEBUG +scan\.provider +outdated=2$/);
  });

  it("filters by level and prints raw records with --json", async () => {
    const { out } = await gup("log", "show", "--level", "warn", "--json");
    const records = out.trimEnd().split("\n").map((line) => JSON.parse(line) as LogRecord);
    expect(records.map((record) => record.event)).toEqual(["cmd.end"]);
  });

  it("refuses bad options with exit 2 and the reason", async () => {
    await expect(gup("log", "--since", "3x")).resolves.toMatchObject({ code: 2, err: expect.stringContaining("période invalide : 3x") });
    await expect(gup("log", "-n", "0")).resolves.toMatchObject({ code: 2, err: expect.stringContaining("nombre de lignes invalide") });
    await expect(gup("log", "-l", "verbose")).resolves.toMatchObject({ code: 2, err: expect.stringContaining("niveau inconnu : verbose") });
  });

  it("says so when nothing matches", async () => {
    const { code, out } = await gup("log", "--grep", "nothing like this");
    expect(code).toBe(0);
    expect(out).toContain("journal vide sur cette période");
  });

  it("never writes to the log it reads, whatever the level", async () => {
    const before = readdirSync(logs).map((name) => readFileSync(join(logs, name), "utf8"));
    await gup("--log-level", "trace", "log", "show");
    await gup("log", "path");
    expect(readdirSync(logs).map((name) => readFileSync(join(logs, name), "utf8"))).toEqual(before);
  });

  it("prints the log directory", async () => {
    await expect(gup("log", "path")).resolves.toEqual({ code: 0, out: `${logs}\n`, err: "" });
  });
});

describe("gup log export", () => {
  it("writes the diagnostic archive in the reports directory and asks for a review", async () => {
    seedLog([[5, { event: "session.start", data: { note: "password=hunter2" } }]]);
    const { code, out } = await gup("log", "export");
    expect(code).toBe(0);
    const [name] = readdirSync(join(dir, "reports"));
    expect(name).toMatch(/^gup-diagnostic-\d{8}-\d{6}\.zip$/);
    expect(out).toContain(`archive de diagnostic : ${join(dir, "reports", name!)}`);
    expect(out).toContain("relisez-la avant de la partager");
    const archive = new AdmZip(join(dir, "reports", name!));
    const entries = archive.getEntries().map((entry) => entry.entryName).sort();
    expect(entries).toEqual(["README.txt", `logs/gup-${utcDay(new Date())}.jsonl`, "system.json"]);
    expect(archive.readAsText(`logs/gup-${utcDay(new Date())}.jsonl`)).toContain("password=***");
  });

  it("never replaces an existing --out without --force", async () => {
    const out = join(dir, "diag.zip");
    writeFileSync(out, "mine");
    await expect(gup("log", "export", "--out", out)).resolves.toMatchObject({
      code: 1,
      err: expect.stringContaining("existe déjà — utilisez --force"),
    });
    expect(readFileSync(out, "utf8")).toBe("mine");
    await expect(gup("log", "export", "--out", out, "--force")).resolves.toMatchObject({ code: 0 });
    expect(new AdmZip(out).getEntries().length).toBeGreaterThanOrEqual(2);
  });

  it("still describes the machine when there is no log yet", async () => {
    await expect(gup("log", "export", "--since", "all")).resolves.toMatchObject({ code: 0 });
    expect(existsSync(logs)).toBe(false);
    const [name] = readdirSync(join(dir, "reports"));
    const entries = new AdmZip(join(dir, "reports", name!)).getEntries().map((entry) => entry.entryName);
    expect(entries.sort()).toEqual(["README.txt", "system.json"]);
  });
});
