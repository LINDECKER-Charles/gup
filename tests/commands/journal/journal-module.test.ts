import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installStartup } from "../../../src/commands/cli/startup.js";
import { journalModule, logDiagnostic } from "../../../src/commands/journal/journal-module.js";
import {
  currentLogSession,
  stopLogSession,
  type LogSession,
} from "../../../src/commands/journal/log-session.js";
import { elevatedLogBuffer } from "../../../src/core/log/elevated-bridge.js";
import { log } from "../../../src/core/log/log.js";
import type { SinkLogBackend } from "../../../src/core/log/log-backend.js";
import type { LogRecord } from "../../../src/core/log/types.js";
import { traceCommand } from "../../../src/core/process/command-tracer.js";
import { updateObservers } from "../../../src/core/update/update-extensions.js";
import { PromptCancelledError } from "../../../src/ui/tui/prompt-cancelled.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "gup-journal-module-"));
  vi.stubEnv("GUP_LOG_DIR", join(dir, "logs"));
});

afterEach(() => {
  stopLogSession();
  elevatedLogBuffer.drain();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  rmSync(dir, { recursive: true, force: true });
});

/** The real module on a program shaped like gup's. */
async function run(...args: string[]): Promise<void> {
  const program = new Command().exitOverride();
  journalModule.register?.(program, { modules: [journalModule] });
  program.command("update [targets...]").action(() => {});
  program.command("__admin-batch <file>").action(() => {});
  installStartup(program, [journalModule]);
  await program.parseAsync(["node", "gup", ...args]);
}

function written(): LogRecord[] {
  const logs = join(dir, "logs");
  if (!existsSync(logs)) return [];
  return readdirSync(logs).flatMap((name) =>
    readFileSync(join(logs, name), "utf8")
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as LogRecord),
  );
}

describe("journalModule startup", () => {
  it("logs the session with the command, its trigger and an allowlisted system snapshot", async () => {
    vi.stubEnv("GITHUB_TOKEN", "ghp_should_never_be_logged");
    await run("--log-level", "debug", "update", "npm-g:x");
    const [start] = written();
    expect(start).toMatchObject({
      level: "info",
      event: "session.start",
      data: { command: "update", trigger: "cli", options: { logLevel: "debug" } },
    });
    const env = (start?.data?.["system"] as { env: Record<string, string> }).env;
    expect(Object.keys(env)).not.toContain("GITHUB_TOKEN");
    expect(Object.keys(env)).not.toContain("PATH");
    expect(JSON.stringify(written())).not.toContain("ghp_should_never_be_logged");
  });

  it("installs the command tracer and the update observer with the log", async () => {
    await run("--log-level", "debug", "update");
    traceCommand("probe", "npm", ["outdated"]).end({ exitCode: 0, failed: false });
    expect(written().map((record) => record.event)).toEqual(["session.start", "cmd.end"]);
    expect(updateObservers()).toHaveLength(1);
    stopLogSession();
    expect(updateObservers()).toHaveLength(0);
  });

  it("installs nothing and opens nothing when the log is off", async () => {
    vi.stubEnv("GUP_LOG_LEVEL", "off");
    await run("update");
    traceCommand("probe", "npm", ["outdated"]).end({ exitCode: 1, failed: true });
    log.error("session.crash");
    expect(existsSync(join(dir, "logs"))).toBe(false);
    expect(currentLogSession()).toMatchObject({ sink: "none", backend: null });
    expect(updateObservers()).toHaveLength(0);
  });

  it("keeps the elevated child's log in memory, for its batch output", async () => {
    vi.stubEnv("GUP_LOG_LEVEL", "info");
    await run("__admin-batch", "batch.json");
    expect(existsSync(join(dir, "logs"))).toBe(false);
    const lines = elevatedLogBuffer.drain().map((line) => JSON.parse(line) as LogRecord);
    expect(lines.map((record) => record.event)).toEqual(["session.start"]);
  });

  it("refuses a --log-level that is not a level before anything runs", async () => {
    const exit = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new Error(`exit ${code}`);
    }) as typeof process.exit);
    const stderr = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    await expect(run("--log-level", "verbose", "update")).rejects.toThrow("exit 2");
    expect(exit).toHaveBeenCalledWith(2);
    expect(String(stderr.mock.calls[0]?.[0])).toContain("niveau inconnu : verbose");
    expect(written()).toEqual([]);
  });

  it("records a crash with its error, and a cancelled prompt as such", async () => {
    await run("--log-level", "info", "update");
    journalModule.onCrash?.(new TypeError("cannot read properties of undefined"));
    journalModule.onCrash?.(new PromptCancelledError());
    const records = written();
    expect(records.map((record) => `${record.level} ${record.event}`)).toEqual([
      "info session.start",
      "error session.crash",
      "info session.cancelled",
    ]);
    expect(records[1]?.data).toMatchObject({ error: { name: "TypeError", message: "cannot read properties of undefined" } });
  });
});

describe("journal diagnostic line", () => {
  it("says what the log records, from where, and where it goes", async () => {
    await run("--log-level", "debug", "update");
    expect(await journalModule.diagnostics?.()).toEqual([
      { label: "Journal de debug", value: expect.stringMatching(/^debug \(--log-level\) · .+logs$/), status: "ok" },
    ]);
  });

  const failing = { failure: () => "EACCES: permission denied" } as unknown as SinkLogBackend;

  it.each([
    [{ settings: { threshold: "off", source: "env" }, sink: "none", dir: null, backend: null }, "off", "désactivé (GUP_LOG_LEVEL)"],
    [
      { settings: { threshold: "info", source: "default", ignoredEnv: "verbose" }, sink: "file", dir: "/x", backend: null },
      "warn",
      "info (défaut) · GUP_LOG_LEVEL ignoré (« verbose » n'est pas un niveau)",
    ],
    [
      { settings: { threshold: "info", source: "default" }, sink: "file", dir: "/x", backend: failing },
      "warn",
      "info (défaut) · non écrit — EACCES: permission denied",
    ],
    [
      { settings: { threshold: "info", source: "default" }, sink: "none", dir: null, backend: null },
      "warn",
      "info (défaut) · aucun dossier de journal sur cette plateforme",
    ],
  ] as const)("reports %j as %s", (session, status, value) => {
    expect(logDiagnostic(session as LogSession)).toEqual({ label: "Journal de debug", value, status });
  });

  it("warns when the startup never ran", () => {
    expect(logDiagnostic(null).status).toBe("warn");
  });
});
