import { existsSync } from "node:fs";
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  AGENT_STDERR_CAP_BYTES,
  ensureSchedulerDir,
  purgeSchedulerFiles,
  schedulerFiles,
  trimAgentStderr,
} from "../../../src/core/scheduler/persistence/scheduler-files.js";

describe("schedulerFiles", () => {
  it("lives in the machine-local state dir of each platform", () => {
    const windows = schedulerFiles({
      platform: "win32",
      env: { LOCALAPPDATA: "C:\\Users\\a\\AppData\\Local" },
      home: "C:\\Users\\a",
    });
    expect(windows).toEqual({
      dir: "C:\\Users\\a\\AppData\\Local\\gup\\scheduler",
      schedules: "C:\\Users\\a\\AppData\\Local\\gup\\scheduler\\schedules.json",
      state: "C:\\Users\\a\\AppData\\Local\\gup\\scheduler\\state.json",
      install: "C:\\Users\\a\\AppData\\Local\\gup\\scheduler\\install.json",
      agentStderr: "C:\\Users\\a\\AppData\\Local\\gup\\scheduler\\agent-stderr.log",
    });
    const mac = schedulerFiles({ platform: "darwin", env: {}, home: "/Users/a" });
    expect(mac?.state).toBe("/Users/a/Library/Application Support/gup/scheduler/state.json");
    const linux = schedulerFiles({ platform: "linux", env: {}, home: "/home/a" });
    expect(linux?.schedules).toBe("/home/a/.local/state/gup/scheduler/schedules.json");
  });

  it("follows GUP_SCHEDULER_DIR, and is null without any anchor", () => {
    const sandbox = schedulerFiles({ platform: "linux", env: { GUP_SCHEDULER_DIR: "/tmp/s" } });
    expect(sandbox?.install).toBe("/tmp/s/install.json");
    expect(schedulerFiles({ platform: "win32", env: {}, home: "" })).toBeNull();
  });
});

describe("purgeSchedulerFiles", () => {
  it("deletes the scheduler's files and lock files, then the empty directory", async () => {
    const dir = await mkdtemp(join(tmpdir(), "gup-purge-"));
    const files = schedulerFiles({ env: { GUP_SCHEDULER_DIR: dir } })!;
    for (const file of [files.schedules, `${files.state}.lock`, files.install]) {
      await writeFile(file, "{}");
    }
    purgeSchedulerFiles(files);
    expect(existsSync(dir)).toBe(false);
  });

  it("leaves a directory that holds other files", async () => {
    const dir = await mkdtemp(join(tmpdir(), "gup-purge-"));
    try {
      const files = schedulerFiles({ env: { GUP_SCHEDULER_DIR: dir } })!;
      await writeFile(files.schedules, "{}");
      await writeFile(join(dir, "mine.txt"), "keep");
      purgeSchedulerFiles(files);
      expect(existsSync(files.schedules)).toBe(false);
      expect(existsSync(join(dir, "mine.txt"))).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("ensureSchedulerDir / trimAgentStderr", () => {
  it("creates the directory, and empties launchd's stderr file once it outgrows its cap", async () => {
    const root = await mkdtemp(join(tmpdir(), "gup-files-"));
    try {
      const files = schedulerFiles({ env: { GUP_SCHEDULER_DIR: join(root, "nested", "scheduler") } })!;
      ensureSchedulerDir(files);
      expect(existsSync(files.dir)).toBe(true);
      trimAgentStderr(files);
      await writeFile(files.agentStderr, "x".repeat(AGENT_STDERR_CAP_BYTES));
      trimAgentStderr(files);
      expect((await stat(files.agentStderr)).size).toBe(AGENT_STDERR_CAP_BYTES);
      await writeFile(files.agentStderr, "x".repeat(AGENT_STDERR_CAP_BYTES + 1));
      trimAgentStderr(files);
      expect((await stat(files.agentStderr)).size).toBe(0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
