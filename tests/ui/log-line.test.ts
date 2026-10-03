import { stripVTControlCharacters } from "node:util";
import { describe, expect, it } from "vitest";
import type { LogRecord } from "../../src/core/log/types.js";
import { levelLabel, logRecordLine, logRecordText } from "../../src/ui/log-line.js";
import { lineWidth } from "../../src/ui/tui/styled-lines.js";

function record(over: Partial<LogRecord>): LogRecord {
  return {
    v: 1,
    // TZ=UTC in the test env: local time is the record's own.
    ts: "2026-10-03T14:22:05.112Z",
    level: "info",
    event: "scan.start",
    runId: "run",
    pid: 1,
    ...over,
  };
}

/** The summary part of a line, as plain text. */
function summary(over: Partial<LogRecord>): string {
  return logRecordLine(record(over)).at(-1)!.text;
}

describe("logRecordLine", () => {
  it("lays out time, level, event and summary, toned by level", () => {
    const line = logRecordLine(record({ level: "warn", event: "scan.provider", data: { outdated: 3 } }));
    expect(line.map((segment) => segment.text).join("")).toBe(
      "03/10 14:22:05.112  AVERT. scan.provider  outdated=3",
    );
    expect(line.map((segment) => segment.tone)).toEqual(["muted", "warning", "strong", "plain"]);
    expect(logRecordLine(record({ level: "error", event: "session.crash" })).at(-1)?.tone).toBe("danger");
  });

  it("summarises the events a human reads most", () => {
    expect(
      summary({
        event: "cmd.end",
        ctx: { op: "update", providerId: "winget" },
        data: { cmd: "C:\\Windows\\winget.exe", args: ["upgrade", "--id", "Git.Git"], exitCode: 0, ms: 18_400 },
      }),
    ).toBe("[winget] winget.exe upgrade --id Git.Git · exit 0 · 18,4 s");
    expect(
      summary({
        event: "cmd.end",
        data: { cmd: "az", args: [], exitCode: 1, ms: 400, timedOut: true, stderrTail: "x\nERROR: run az login\n" },
      }),
    ).toBe("az · exit 1 · 0,4 s · délai dépassé · ERROR: run az login");
    expect(summary({ event: "update.start", data: { providerId: "winget", packageId: "Git.Git", from: "2.51.0", to: "2.52.0" } })).toBe(
      "winget · Git.Git 2.51.0 → 2.52.0",
    );
    expect(
      summary({ event: "update.end", data: { providerId: "npm-g", packageId: "x", status: "failed", ms: 1200, message: "EPERM" } }),
    ).toBe("npm-g · x · échec · 1,2 s · EPERM");
    expect(summary({ event: "session.start", data: { command: "", trigger: "menu" } })).toBe("menu · menu");
    expect(summary({ event: "session.end", data: { code: 0, ms: 2500 } })).toBe("code 0 · 2,5 s");
    expect(summary({ event: "session.crash", data: { error: { name: "TypeError", message: "boom" } } })).toBe("boom");
  });

  it("lists the scalar data of other events, and marks the elevated child's records", () => {
    expect(summary({ event: "update.cancelled", data: { count: 2, packages: ["a:b"], note: null } })).toBe(
      "count=2 note=null",
    );
    expect(summary({ event: "cmd.start", elevated: true, data: { cmd: "choco", args: ["upgrade", "git"] } })).toBe(
      "[admin] choco upgrade git",
    );
  });

  it("cuts the summary to the width it is given", () => {
    const line = logRecordLine(record({ event: "update.end", data: { message: "x".repeat(200) } }), 60);
    expect(lineWidth(line)).toBeLessThanOrEqual(60);
    expect(line.at(-1)?.text.endsWith("…")).toBe(true);
  });
});

describe("logRecordText and levelLabel", () => {
  it("joins the line into terminal text", () => {
    const text = logRecordText(record({ event: "session.end", data: { code: 3, ms: 10 } }));
    expect(stripVTControlCharacters(text)).toMatch(
      /03\/10 14:22:05\.112 .*INFO .*session\.end .*code 3 · 0,0 s/,
    );
  });

  it("names each level in French, six columns at most", () => {
    expect(["error", "warn", "info", "debug", "trace"].map((level) => levelLabel(level as never))).toEqual([
      "ERREUR",
      "AVERT.",
      "INFO",
      "DEBUG",
      "TRACE",
    ]);
  });
});
