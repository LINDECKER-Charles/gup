import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { run } from "../../src/core/runner.js";
import type { LogRecord } from "../../src/core/log/types.js";

/**
 * The real CLI, in a real process: every command ends with
 * `process.exit(code)`, which drops pending asynchronous writes. The debug
 * log writes synchronously, so the session's last records — up to the exit
 * hook's `session.end` — are on disk when the process is gone.
 */

const CLI = join(process.cwd(), "src", "cli.ts");
/** tsx start-up on a loaded Windows runner is the slow part, not gup. */
const SPAWN_TIMEOUT_MS = 30_000;

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "gup-log-exit-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function gup(args: readonly string[], env: Record<string, string>) {
  return run(process.execPath, ["--import", "tsx", CLI, ...args], {
    env: { GUP_LOG_DIR: join(dir, "logs"), GUP_HISTORY: "0", GUP_CONFIG: "0", ...env },
    timeout: SPAWN_TIMEOUT_MS,
  });
}

async function records(): Promise<LogRecord[]> {
  const logs = join(dir, "logs");
  const names = await readdir(logs);
  const contents = await Promise.all(names.map((name) => readFile(join(logs, name), "utf8")));
  return contents.flatMap((content) =>
    content
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as LogRecord),
  );
}

describe("debug log across process.exit", () => {
  it(
    "has the session's start and end on disk once the process exited with its code",
    async () => {
      const result = await gup(["update", "nope:x"], { GUP_LOG_LEVEL: "info" });
      expect(result.exitCode).toBe(2);
      const logged = await records();
      expect(logged.map((record) => record.event)).toEqual(["session.start", "session.end"]);
      expect(logged[1]?.data).toMatchObject({ code: 2 });
      expect(new Set(logged.map((record) => record.runId)).size).toBe(1);
    },
    SPAWN_TIMEOUT_MS * 2,
  );

  it(
    "opens no file at all when GUP_LOG_LEVEL=off",
    async () => {
      const result = await gup(["update", "nope:x"], { GUP_LOG_LEVEL: "off" });
      expect(result.exitCode).toBe(2);
      await expect(readdir(join(dir, "logs"))).rejects.toMatchObject({ code: "ENOENT" });
    },
    SPAWN_TIMEOUT_MS * 2,
  );
});
