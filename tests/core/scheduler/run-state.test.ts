import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { SchedulerState } from "../../../src/core/scheduler/model/types.js";
import {
  RunStateStore,
  withoutOrphans,
  withScheduleState,
} from "../../../src/core/scheduler/persistence/run-state.js";

let dir: string;
let file: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "gup-state-"));
  file = join(dir, "nested", "state.json");
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const lastRun = {
  kind: "on-time",
  status: "partial",
  startedAt: "2026-10-05T09:05:00.000Z",
  finishedAt: "2026-10-05T09:07:00.000Z",
  targets: [
    { target: "winget:Git.Git", status: "updated", from: "1", to: "2" },
    { target: "npm-g:x", status: "failed", message: "boom" },
  ],
} as const;

describe("RunStateStore", () => {
  it("reads an absent file as empty", () => {
    expect(new RunStateStore(file).read()).toEqual({ v: 1, schedules: {} });
  });

  it("writes atomically and reads back what it wrote", () => {
    const store = new RunStateStore(file);
    const written = store.update((state) =>
      withScheduleState({ ...state, lastTickAt: "2026-10-05T09:05:00.000Z" }, "a1b2c3d4", () => ({
        lastAttemptAt: "2026-10-05T09:05:00.000Z",
        deferrals: 2,
        lastRun,
      })),
    );
    expect(new RunStateStore(file).read()).toEqual(written);
    expect(written.schedules["a1b2c3d4"]?.lastRun).toEqual(lastRun);
  });

  it("reads a corrupt or foreign file as empty, and the next write replaces it", async () => {
    const store = new RunStateStore(file);
    store.update((state) => state);
    for (const content of ["{not json", JSON.stringify({ v: 2, schedules: {} }), "[]"]) {
      await writeFile(file, content);
      expect(store.read()).toEqual({ v: 1, schedules: {} });
    }
    store.update((state) => ({ ...state, lastTickAt: "2026-10-05T09:05:00.000Z" }));
    expect(JSON.parse(await readFile(file, "utf8"))).toEqual({
      v: 1,
      lastTickAt: "2026-10-05T09:05:00.000Z",
      schedules: {},
    });
  });

  it("drops malformed entries field by field", async () => {
    const store = new RunStateStore(file);
    store.update((state) => state);
    await writeFile(
      file,
      JSON.stringify({
        v: 1,
        schedules: {
          a1b2c3d4: { lastAttemptAt: 3, deferrals: -1, lastRun: { kind: "weird" } },
          __proto__: { polluted: true },
          "not-an-id": { lastAttemptAt: "2026-10-05T09:05:00.000Z" },
          "0badf00d": { lastRun: { ...lastRun, targets: [{ target: "x:y", status: "?" }, 5] } },
        },
      }),
    );
    expect(store.read()).toEqual({
      v: 1,
      schedules: { a1b2c3d4: {}, "0badf00d": { lastRun: { ...lastRun, targets: [] } } },
    });
  });
});

describe("withoutOrphans", () => {
  it("keeps only the entries of live schedules", () => {
    const state: SchedulerState = { v: 1, schedules: { a1b2c3d4: {}, "0badf00d": {} } };
    expect(withoutOrphans(state, new Set(["a1b2c3d4"]))).toEqual({
      v: 1,
      schedules: { a1b2c3d4: {} },
    });
  });
});
