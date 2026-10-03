import AdmZip from "adm-zip";
import { describe, expect, it } from "vitest";
import { buildDiagnosticZip } from "../../../src/core/export/diagnostic-bundle.js";
import type { LogRecord } from "../../../src/core/log/types.js";
import type { SystemSnapshot } from "../../../src/core/state/system-snapshot.js";

const SYSTEM: SystemSnapshot = {
  gup: "0.5.0",
  node: "v26.10.0",
  platform: "win32",
  arch: "x64",
  osRelease: "10.0.26200",
  tty: { stdin: true, stdout: true },
  env: { GUP_LOG_LEVEL: "debug", HTTPS_PROXY_NOTE: "http://bob:pw@proxy:8080" },
};

function line(over: Partial<LogRecord>): string {
  return JSON.stringify({
    v: 1,
    ts: "2026-10-03T12:00:00.000Z",
    level: "warn",
    event: "cmd.end",
    runId: "run",
    pid: 1,
    ...over,
  });
}

function entries(zip: Buffer): Map<string, string> {
  const archive = new AdmZip(zip);
  return new Map(archive.getEntries().map((entry) => [entry.entryName, archive.readAsText(entry)]));
}

describe("buildDiagnosticZip", () => {
  it("holds a README, the system description and the log files under fixed names", () => {
    const archive = buildDiagnosticZip({
      generatedAt: new Date("2026-10-03T12:30:00.000Z"),
      system: SYSTEM,
      logs: [{ name: "gup-2026-10-03.jsonl", content: `${line({})}\n` }],
    });
    const files = entries(archive.zip);
    expect([...files.keys()].sort()).toEqual(["README.txt", "logs/gup-2026-10-03.jsonl", "system.json"]);
    expect(files.get("README.txt")).toContain("Relisez-la avant de la joindre");
    expect(files.get("README.txt")).toContain("gup-2026-10-03.jsonl");
    expect(JSON.parse(files.get("system.json")!)).toMatchObject({ gup: "0.5.0", platform: "win32" });
    expect(archive.records).toBe(1);
  });

  it("redacts every log line again and the system description too", () => {
    const leaked = line({ data: { stderrTail: "fatal: https://bob:hunter2@git.example.com", token: "abc" } });
    const archive = buildDiagnosticZip({
      generatedAt: new Date(),
      system: SYSTEM,
      logs: [{ name: "gup-2026-10-03.jsonl", content: `${leaked}\n` }],
    });
    const files = entries(archive.zip);
    const log = files.get("logs/gup-2026-10-03.jsonl")!;
    expect(log).not.toContain("hunter2");
    expect(JSON.parse(log)).toMatchObject({ data: { stderrTail: "fatal: https://***@git.example.com", token: "***" } });
    expect(files.get("system.json")).not.toContain("bob:pw");
  });

  it("drops what is not a record, says how many lines in the README, and skips foreign file names", () => {
    const archive = buildDiagnosticZip({
      generatedAt: new Date(),
      system: SYSTEM,
      logs: [
        { name: "gup-2026-10-03.jsonl", content: `${line({})}\nraw secret token=abc\n{"v":1}\n` },
        { name: "../../evil.txt", content: line({}) },
      ],
    });
    const files = entries(archive.zip);
    expect([...files.keys()].sort()).toEqual(["README.txt", "logs/gup-2026-10-03.jsonl", "system.json"]);
    expect(files.get("logs/gup-2026-10-03.jsonl")!.trim().split("\n")).toHaveLength(1);
    expect(archive).toMatchObject({ records: 1, dropped: 2 });
    expect(files.get("README.txt")).toContain("2 ligne(s) illisible(s)");
  });
});
