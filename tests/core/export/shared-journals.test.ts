import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  collectSharedJournals,
  type JournalQuery,
} from "../../../src/core/export/shared-journals.js";
import { updateEvent, writeHistoryShards } from "../../support/history-fixtures.js";
import { useTempDirs } from "../../support/temp-dirs.js";

const NOW = new Date("2026-11-20T12:00:00.000Z");
const EPOCH = new Date("2026-01-01T00:00:00.000Z");

function logLine(ts: string, event: string, data?: Record<string, unknown>): string {
  return JSON.stringify({ v: 1, ts, level: "info", event, runId: "r", pid: 1, ...(data && { data }) });
}

describe("collectSharedJournals", () => {
  const tempDir = useTempDirs();

  async function logDir(files: Record<string, string[]>): Promise<string> {
    const dir = await tempDir("gup-logs-");
    await mkdir(dir, { recursive: true });
    for (const [name, lines] of Object.entries(files)) {
      await writeFile(join(dir, name), `${lines.join("\n")}\n`, "utf8");
    }
    return dir;
  }

  function query(over: Partial<JournalQuery>): JournalQuery {
    return {
      historyFrom: EPOCH,
      logsFrom: EPOCH,
      now: NOW,
      limit: 1_000,
      dirs: { history: null, logs: null },
      ...over,
    };
  }

  it("reads every log file and part from the cursor's day on, oldest first", async () => {
    const logs = await logDir({
      "gup-2026-11-17.jsonl": [logLine("2026-11-17T10:00:00.000Z", "run.old")],
      "gup-2026-11-18.jsonl": [
        logLine("2026-11-18T09:59:59.999Z", "run.before"),
        logLine("2026-11-18T10:00:00.000Z", "run.at-cursor"),
      ],
      "gup-2026-11-18.1.jsonl": [logLine("2026-11-18T11:00:00.000Z", "run.part")],
      "gup-2026-11-19.jsonl": [logLine("2026-11-19T08:00:00.000Z", "run.next-day")],
    });

    const items = await collectSharedJournals(
      query({ logsFrom: new Date("2026-11-18T10:00:00.000Z"), dirs: { history: null, logs } }),
    );

    expect(items.map((item) => (item.record as { event: string }).event)).toEqual([
      "run.at-cursor",
      "run.part",
      "run.next-day",
    ]);
  });

  it("reads the history across month shards, from the cursor's instant on", async () => {
    const history = await tempDir("gup-history-");
    await writeHistoryShards(history, [
      updateEvent("winget", "Sep.Package", { ts: "2026-09-30T23:00:00.000Z" }),
      updateEvent("winget", "Oct.Package", { ts: "2026-10-15T08:00:00.000Z" }),
      updateEvent("winget", "Nov.Package", { ts: "2026-11-02T08:00:00.000Z" }),
    ]);

    const items = await collectSharedJournals(
      query({ historyFrom: new Date("2026-10-15T08:00:00.000Z"), dirs: { history, logs: null } }),
    );

    expect(items.map((item) => (item.record as { packageId: string }).packageId)).toEqual([
      "Oct.Package",
      "Nov.Package",
    ]);
  });

  it("merges both streams by instant and keeps to the limit", async () => {
    const history = await tempDir("gup-history-");
    await writeHistoryShards(history, [
      updateEvent("winget", "Git.Git", { ts: "2026-11-18T10:30:00.000Z" }),
    ]);
    const logs = await logDir({
      "gup-2026-11-18.jsonl": [
        logLine("2026-11-18T10:00:00.000Z", "run.first"),
        logLine("2026-11-18T11:00:00.000Z", "run.third"),
      ],
    });

    const items = await collectSharedJournals(query({ limit: 2, dirs: { history, logs } }));

    expect(items.map((item) => item.stream)).toEqual(["logs", "history"]);
  });

  it("never shares the environment, nor what sharing itself logged", async () => {
    const system = {
      gup: "0.6.0",
      node: "v26.10.0",
      platform: "linux",
      arch: "x64",
      osRelease: "6.8.0-45-generic",
      tty: { stdin: true, stdout: true },
      env: { LANG: "fr_FR.UTF-8", GUP_LOG_DIR: "/home/alice/logs", WSL_DISTRO_NAME: "Ubuntu" },
    };
    const logs = await logDir({
      "gup-2026-11-18.jsonl": [
        logLine("2026-11-18T10:00:00.000Z", "session.start", { command: "update", system }),
        logLine("2026-11-18T10:00:01.000Z", "sharing.upload", { history: 1, logs: 2 }),
        logLine("2026-11-18T10:00:02.000Z", "run.step", { env: { HOME: "/home/alice" } }),
      ],
    });

    const items = await collectSharedJournals(query({ dirs: { history: null, logs } }));

    expect(items.map((item) => (item.record as { event: string }).event)).toEqual([
      "session.start",
      "run.step",
    ]);
    expect((items[0]!.record as { data: unknown }).data).toEqual({
      command: "update",
      system: { gup: "0.6.0", node: "v26.10.0", platform: "linux", arch: "x64" },
    });
    expect((items[1]!.record as { data?: unknown }).data).toEqual({});
    expect(JSON.stringify(items)).not.toMatch(/LANG|WSL_DISTRO_NAME|GUP_LOG_DIR|osRelease|alice/);
  });
});
