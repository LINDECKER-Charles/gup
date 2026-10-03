import { spawn } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BatchLock,
  batchLockLocation,
  createBatchGuard,
  type BatchLockLocation,
} from "../../../src/core/update/batch-lock.js";

let schedulerDir: string;
let location: BatchLockLocation;
const held: BatchLock[] = [];

beforeEach(async () => {
  schedulerDir = await mkdtemp(join(tmpdir(), "gup-batch-"));
  location = batchLockLocation({ env: { GUP_SCHEDULER_DIR: schedulerDir } })!;
});

afterEach(async () => {
  for (const lock of held.splice(0)) await lock.release();
});

async function acquire(kind: "interactive" | "scheduled" = "scheduled"): Promise<BatchLock> {
  const lock = await BatchLock.tryAcquire(location, kind);
  if (!(lock instanceof BatchLock)) throw new Error("expected to take the batch");
  held.push(lock);
  return lock;
}

describe("batchLockLocation", () => {
  it("names a per-user pipe on Windows, derived from the scheduler dir", () => {
    const at = (dir: string) =>
      batchLockLocation({ platform: "win32", env: { GUP_SCHEDULER_DIR: dir }, home: "C:\\Users\\a" });
    const a = at("C:\\Users\\a\\AppData\\Local\\gup\\scheduler")!;
    expect(a.endpoint).toMatch(/^\\\\\.\\pipe\\gup-update-[0-9a-f]{16}$/);
    expect(a.infoFile).toBe("C:\\Users\\a\\AppData\\Local\\gup\\scheduler\\update-lock.json");
    expect(at("C:\\USERS\\A\\APPDATA\\LOCAL\\GUP\\SCHEDULER")!.endpoint).toBe(a.endpoint);
    expect(at("D:\\sandbox\\scheduler")!.endpoint).not.toBe(a.endpoint);
  });

  it("puts the socket under the scheduler state dir on POSIX", () => {
    expect(batchLockLocation({ platform: "darwin", env: {}, home: "/Users/a" })).toEqual({
      endpoint: "/Users/a/Library/Application Support/gup/scheduler/update.sock",
      infoFile: "/Users/a/Library/Application Support/gup/scheduler/update-lock.json",
    });
  });

  it("moves a socket path too long for sun_path to the runtime dir", () => {
    const deep = `/home/a/${"x".repeat(120)}`;
    const found = batchLockLocation({
      platform: "linux",
      env: { GUP_SCHEDULER_DIR: deep, XDG_RUNTIME_DIR: "/run/user/1000" },
      home: "/home/a",
    })!;
    expect(found.endpoint).toMatch(/^\/run\/user\/1000\/gup-update-[0-9a-f]{16}\.sock$/);
    expect(found.infoFile).toBe(`${deep}/update-lock.json`);
  });

  it("is null without a state dir", () => {
    expect(batchLockLocation({ platform: "win32", env: {}, home: "" })).toBeNull();
  });
});

describe("BatchLock", () => {
  it("lets one holder in, tells the next who holds it, and frees it on release", async () => {
    const lock = await acquire("scheduled");
    const second = await BatchLock.tryAcquire(location, "interactive");
    expect(second).toEqual({
      busy: { kind: "scheduled", pid: process.pid, startedAt: expect.any(String) },
    });
    await lock.release();
    await lock.release();
    expect(existsSync(location.infoFile)).toBe(false);
    expect(await acquire("interactive")).toBeInstanceOf(BatchLock);
  });

  it("reports an unknown holder when the display file is unreadable", async () => {
    await acquire();
    writeFileSync(location.infoFile, "{ broken");
    expect(await BatchLock.tryAcquire(location, "interactive")).toEqual({ busy: null });
  });

  it.skipIf(process.platform === "win32")("takes over the socket file a crashed holder left", async () => {
    writeFileSync(location.endpoint, "");
    expect(await acquire()).toBeInstanceOf(BatchLock);
  });

  it("is released by the operating system when the holder process dies", async () => {
    const child = spawn(
      process.execPath,
      ["--import", "tsx", join(import.meta.dirname, "batch-lock-holder.ts"), schedulerDir],
      { stdio: ["ignore", "pipe", "inherit"] },
    );
    try {
      const said = await new Promise<string>((resolve) => child.stdout.once("data", (d) => resolve(String(d))));
      expect(said.trim()).toBe("held");
      expect(await BatchLock.tryAcquire(location, "interactive")).toMatchObject({
        busy: { kind: "scheduled", pid: child.pid },
      });
    } finally {
      child.kill("SIGKILL");
      await new Promise((resolve) => child.once("exit", resolve));
    }
    expect(await acquire("interactive")).toBeInstanceOf(BatchLock);
  }, 30_000);
});

describe("createBatchGuard", () => {
  it("enters at once when the batch is free", async () => {
    const onWait = vi.fn();
    const release = await createBatchGuard(location, 20).enter({ onWait, isAborted: () => false });
    expect(onWait).not.toHaveBeenCalled();
    expect(await BatchLock.tryAcquire(location, "interactive")).toHaveProperty("busy");
    release();
  });

  it("reports the holder once, then waits for it to leave", async () => {
    const lock = await acquire("scheduled");
    const onWait = vi.fn();
    const entering = createBatchGuard(location, 20).enter({ onWait, isAborted: () => false });
    await vi.waitFor(() => expect(onWait).toHaveBeenCalledTimes(1));
    expect(onWait.mock.calls[0]![0]).toMatchObject({ kind: "scheduled" });
    await lock.release();
    const release = await entering;
    expect(onWait).toHaveBeenCalledTimes(1);
    release();
  });

  it("gives up the wait as soon as it is aborted, holding nothing", async () => {
    await acquire("scheduled");
    let isAborted = false;
    const entering = createBatchGuard(location, 5_000).enter({
      onWait: () => {
        isAborted = true;
      },
      isAborted: () => isAborted,
    });
    const release = await entering;
    release();
    expect(await BatchLock.tryAcquire(location, "interactive")).toHaveProperty("busy");
  });
});
