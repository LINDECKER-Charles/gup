import { afterEach, describe, expect, it } from "vitest";
import { installLogBackend, type LogInput, type LogLevel } from "../../../src/core/log/log.js";
import { createLogTracer } from "../../../src/core/log/log-tracer.js";

interface Emitted {
  readonly level: LogLevel;
  readonly event: string;
  readonly data: LogInput | undefined;
}

afterEach(() => {
  installLogBackend(null);
});

const RANK: Readonly<Record<LogLevel, number>> = { error: 0, warn: 1, info: 2, debug: 3, trace: 4 };

/** A backend recording from `threshold` on, keeping what the tracer emits. */
function recordingAt(threshold: LogLevel): Emitted[] {
  const emitted: Emitted[] = [];
  installLogBackend({
    isEnabled: (level) => RANK[level] <= RANK[threshold],
    emit: (level, event, data) => void emitted.push({ level, event, data }),
  });
  return emitted;
}

const trace = createLogTracer();

describe("createLogTracer", () => {
  it("computes and records nothing when the end of the command would not be recorded", () => {
    const emitted = recordingAt("info");
    trace("probe", "npm", ["outdated"]).end({ exitCode: 1, failed: true, stderr: "boom" });
    const quiet = recordingAt("error");
    trace("inherit", "winget", ["upgrade"]).end({ exitCode: 1, failed: true });
    expect([...emitted, ...quiet]).toEqual([]);
  });

  it("logs a probe's end at debug, with the stderr tail only when it failed", () => {
    const emitted = recordingAt("debug");
    trace("probe", "npm", ["outdated", "--json"]).end({ exitCode: 0, failed: false, stdout: "{}", stderr: "warn" });
    trace("probe", "az", ["version"]).end({ exitCode: 1, failed: true, stderr: "line 1\nERROR: run az login" });
    expect(emitted.map(({ level, event }) => `${level} ${event}`)).toEqual(["debug cmd.end", "debug cmd.end"]);
    expect(emitted[0]?.data).toMatchObject({ mode: "probe", cmd: "npm", args: ["outdated", "--json"], exitCode: 0, failed: false });
    expect(emitted[0]?.data).not.toHaveProperty("stderrTail");
    expect(emitted[0]?.data).not.toHaveProperty("stdoutTail");
    expect(emitted[1]?.data).toMatchObject({ exitCode: 1, failed: true, stderrTail: "line 1\nERROR: run az login" });
  });

  it("adds the probe's start and stdout tail at trace", () => {
    const emitted = recordingAt("trace");
    trace("probe", "pip", ["list"]).end({ exitCode: 0, failed: false, stdout: "pip 25.0" });
    expect(emitted.map(({ level, event }) => `${level} ${event}`)).toEqual(["trace cmd.start", "debug cmd.end"]);
    expect(emitted[1]?.data).toMatchObject({ stdoutTail: "pip 25.0" });
  });

  it("logs installs at info, and their failure, timeout or skip at warn", () => {
    const emitted = recordingAt("info");
    trace("inherit", "winget", ["upgrade", "--id", "Git.Git"]).end({ exitCode: 0, failed: false });
    trace("pty", "choco", ["upgrade", "git"]).end({ exitCode: -1, failed: true, timedOut: true, stdout: "…\nwaiting" });
    trace("pipe", "npm", ["i", "-g", "x"]).end({ exitCode: 1, failed: true, aborted: true });
    expect(emitted.map(({ level, event }) => `${level} ${event}`)).toEqual([
      "info cmd.start",
      "info cmd.end",
      "info cmd.start",
      "warn cmd.end",
      "info cmd.start",
      "warn cmd.end",
    ]);
    expect(emitted[3]?.data).toMatchObject({ mode: "pty", timedOut: true, outputTail: "…\nwaiting" });
    expect(emitted[5]?.data).toMatchObject({ mode: "pipe", aborted: true });
  });

  it("redacts the command line and the output it keeps", () => {
    const emitted = recordingAt("debug");
    trace("probe", "gh", ["auth", "login", "--with-token", "--token", "ghp_secret"]).end({
      exitCode: 1,
      failed: true,
      stderr: "HTTP 401 for https://bob:pw@api.example.com",
    });
    expect(emitted[0]?.data).toMatchObject({
      args: ["auth", "login", "--with-token", "--token", "***"],
      stderrTail: "HTTP 401 for https://***@api.example.com",
    });
  });

  it("keeps the end of a long output, cut under the per-string cap", () => {
    const emitted = recordingAt("debug");
    const stderr = `${"noise\n".repeat(2000)}the real error`;
    trace("probe", "cargo", ["install-update", "-l"]).end({ exitCode: 101, failed: true, stderr });
    const tail = String(emitted[0]?.data?.["stderrTail"]);
    expect(tail.startsWith("(…) ")).toBe(true);
    expect(tail.endsWith("the real error")).toBe(true);
    expect(tail.length).toBeLessThanOrEqual(2000);
  });
});
