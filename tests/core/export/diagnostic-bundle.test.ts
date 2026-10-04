import AdmZip from "adm-zip";
import { homedir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildDiagnosticZip, type DiagnosticInput } from "../../../src/core/export/diagnostic-bundle.js";
import type { LogRecord } from "../../../src/core/log/types.js";
import type { SystemSnapshot } from "../../../src/core/state/system-snapshot.js";
import { diagnosticReadme } from "../../../src/ui/text/journal/log-labels.js";

const SYSTEM: SystemSnapshot = {
  gup: "0.5.0",
  node: "v26.10.0",
  platform: "win32",
  arch: "x64",
  osRelease: "10.0.26200",
  tty: { stdin: true, stdout: true },
  env: { GUP_LOG_LEVEL: "debug", HTTPS_PROXY_NOTE: "http://bob:pw@proxy:8080" },
};

/**
 * A made-up token in npm's legacy UUID shape. Assembled at run time so that
 * secret scanners (GitHub push protection) do not mistake the fixture for a
 * real credential.
 */
const FAKE_LEGACY_NPM_TOKEN = ["4f8a1c2e", "9b3d", "4e5f", "8a7b", "1c2d3e4f5a6b"].join("-");

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

/** The archive `gup log export` builds, with its French README. */
function build(input: Omit<DiagnosticInput, "readme">) {
  return buildDiagnosticZip({ ...input, readme: diagnosticReadme });
}

function entries(zip: Buffer): Map<string, string> {
  const archive = new AdmZip(zip);
  return new Map(archive.getEntries().map((entry) => [entry.entryName, archive.readAsText(entry)]));
}

describe("buildDiagnosticZip", () => {
  it("holds a README, the system description and the log files under fixed names", () => {
    const archive = build({
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
    const archive = build({
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

  it("leaves neither the home directory nor a known secret anywhere in the archive", () => {
    const home = homedir();
    const older = line({
      ctx: { op: "update", providerId: "npm-g", packageId: join(home, "pkg") },
      data: {
        [join(home, "npmrc")]: `//registry.npmjs.org/:_authToken=${FAKE_LEGACY_NPM_TOKEN}`,
        stderrTail: `EACCES ${join(home, "AppData", "x")} AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG`,
      },
    });
    const archive = build({
      generatedAt: new Date(),
      system: { ...SYSTEM, env: { GUP_LOG_DIR: join(home, "logs") } },
      logs: [{ name: "gup-2026-10-03.jsonl", content: `${older}\n` }],
    });
    const everything = [...entries(archive.zip).values()].join("\n").toLowerCase();
    const escapedHome = JSON.stringify(home).slice(1, -1);
    for (const leak of [home, escapedHome, "4f8a1c2e-9b3d", "wJalrXUtnFEMI"]) {
      expect(everything).not.toContain(leak.toLowerCase());
    }
    expect(archive.records).toBe(1);
  });

  it("adds the activity summary it is given, or says in the README why there is none", () => {
    const summary = { summary: { totals: { attempts: 3 } } };
    const withSummary = entries(build({ generatedAt: new Date(), system: SYSTEM, logs: [], history: summary }).zip);
    expect(JSON.parse(withSummary.get("history-summary.json")!)).toEqual({ totals: { attempts: 3 } });
    expect(withSummary.get("README.txt")).toContain("history-summary.json");

    const reason = `EACCES: permission denied, scandir '${join(homedir(), "history")}'`;
    const unreadable = entries(
      build({ generatedAt: new Date(), system: SYSTEM, logs: [], history: { unreadable: reason } }).zip,
    );
    expect([...unreadable.keys()].sort()).toEqual(["README.txt", "system.json"]);
    expect(unreadable.get("README.txt")).toContain("historique illisible — EACCES: permission denied");
    expect(unreadable.get("README.txt")!.toLowerCase()).not.toContain(homedir().toLowerCase());

    const leftOut = entries(build({ generatedAt: new Date(), system: SYSTEM, logs: [] }).zip);
    expect(leftOut.get("README.txt")).not.toContain("résumé d'activité");
  });

  it("drops what is not a record, says how many lines in the README, and skips foreign file names", () => {
    const archive = build({
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
    expect(files.get("README.txt")).toContain("2 lignes illisibles du journal ont été omises.");
  });
});
