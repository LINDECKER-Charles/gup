import { afterEach, describe, expect, it, vi } from "vitest";
import { installLogBackend, type LogInput, type LogLevel } from "../../../src/core/log/log.js";
import type {
  Schedule,
  SchedulerState,
} from "../../../src/core/scheduler/model/types.js";
import {
  SCHEDULED_RUN_MESSAGES,
  ScheduledRun,
  type ScheduledRunDeps,
  type SkippedTarget,
  type TickExecutor,
} from "../../../src/core/scheduler/scheduled-run.js";
import { TOO_FREQUENT } from "../../../src/core/scheduler/model/validate-schedule.js";
import { MAX_DEFERRALS } from "../../../src/core/scheduler/scheduler-timing.js";
import { TargetResolver, type TargetScan } from "../../../src/core/scheduler/target-resolver.js";
import type { UpdateOutcome } from "../../../src/core/types.js";
import { MANUAL_SKIP_MESSAGE } from "../../../src/core/update/finalize-outcome.js";
import { updateKeyOf } from "../../../src/core/update/update-plan.js";
import type { PlannedUpdate, UpdateRequest } from "../../../src/core/update/update-ports.js";
import { buildReport } from "../../../src/core/update/update-report.js";
import { outcome, pkg, scan } from "../../support/builders.js";
import { providerFacts, schedule, target } from "./scheduler-fixtures.js";

afterEach(() => installLogBackend(null));

// Daily 09:00 schedules (TZ=UTC); the tick runs Monday 09:05.
const TICK_AT = new Date("2026-10-05T09:05:00Z");
const YESTERDAY = "2026-10-04T09:05:00.000Z";

interface Harness {
  readonly run: ScheduledRun;
  readonly state: { current: SchedulerState };
  readonly scanned: string[][];
  readonly requests: UpdateRequest[][];
  readonly skipped: SkippedTarget[];
  readonly batch: { taken: number; released: number };
  readonly clock: { now: Date };
  readonly interrupt: ReturnType<typeof vi.fn<() => void>>;
}

interface HarnessOptions {
  readonly schedules?: readonly Schedule[];
  readonly state?: SchedulerState;
  readonly scan?: TargetScan;
  readonly busy?: boolean;
  /** Outcome per request; absent: success. */
  readonly outcomes?: Readonly<Record<string, UpdateOutcome>>;
  /** Called before each attempt, with the harness. */
  readonly beforeAttempt?: (harness: Harness, request: UpdateRequest) => void;
}

const DEFAULT_SCAN: TargetScan = {
  results: [scan("winget", [pkg("Git.Git")]), scan("npm-g", [pkg("typescript")])],
  available: new Set(["winget", "npm-g"]),
};

function seenYesterday(...ids: string[]): SchedulerState {
  return {
    v: 1,
    schedules: Object.fromEntries(ids.map((id) => [id, { lastAttemptAt: YESTERDAY }])),
  };
}

function harness(options: HarnessOptions = {}): Harness {
  const schedules = options.schedules ?? [schedule()];
  const state = { current: options.state ?? seenYesterday(...schedules.map((s) => s.id)) };
  const h = {
    state,
    scanned: [] as string[][],
    requests: [] as UpdateRequest[][],
    skipped: [] as SkippedTarget[],
    batch: { taken: 0, released: 0 },
    clock: { now: TICK_AT },
    interrupt: vi.fn<() => void>(),
  } as Omit<Harness, "run"> & { run?: ScheduledRun };
  const deps: ScheduledRunDeps = {
    clock: () => h.clock.now,
    schedules: () => schedules,
    state: {
      read: () => state.current,
      update: (mutate) => (state.current = mutate(state.current)),
    },
    batch: {
      tryAcquire: async () => {
        if (options.busy) return { busy: { kind: "interactive", pid: 42, startedAt: "x" } };
        h.batch.taken++;
        return { release: async () => void h.batch.released++ };
      },
    },
    resolver: new TargetResolver({
      scanner: async (ids) => {
        h.scanned.push([...ids]);
        return options.scan ?? DEFAULT_SCAN;
      },
      providers: providerFacts({ winget: {}, "npm-g": {} }),
    }),
    execute: fakePipeline(h as Harness, options),
    recordSkipped: (skippedTarget) => h.skipped.push(skippedTarget),
    interruptCurrent: h.interrupt,
    deadlineMs: 60_000,
  };
  h.run = new ScheduledRun(deps);
  return h as Harness;
}

/** The pipeline's contract in miniature: one attempt per request until the gate closes. */
function fakePipeline(h: Harness, options: HarnessOptions): TickExecutor {
  return async (requests, gate) => {
    h.requests.push([...requests]);
    const entries = [];
    const cancelled: PlannedUpdate[] = [];
    for (const request of requests) {
      const key = updateKeyOf(request.providerId, request.packageId);
      if (gate.isAbortRequested()) {
        cancelled.push({ ...request, key, providerName: request.providerId });
        continue;
      }
      options.beforeAttempt?.(h, request);
      const result = options.outcomes?.[key] ?? outcome(request.packageId);
      entries.push({ key, providerId: request.providerId, outcome: result });
    }
    return buildReport(entries, cancelled);
  };
}

const twoTargets = schedule({
  targets: [target("winget", "Git.Git"), target("npm-g", "typescript")],
});

describe("ScheduledRun.tick", () => {
  it("stays idle without an enabled schedule: no batch, no write", async () => {
    const disabled = [schedule({ enabled: false })];
    const h = harness({ schedules: disabled, state: { v: 1, schedules: {} } });
    expect(await h.run.tick()).toEqual({ kind: "idle" });
    expect(h.batch.taken).toBe(0);
    expect(h.state.current).toEqual({ v: 1, schedules: {} });
  });

  it("never runs a schedule edited by hand past the hourly minimum, and logs why", async () => {
    const records: [LogLevel, string, LogInput | undefined][] = [];
    installLogBackend({
      isEnabled: () => true,
      emit: (level, event, data) => void records.push([level, event, data]),
    });
    const everyMinute = schedule({
      id: "0badf00d",
      recurrence: { kind: "cron", expression: "* * * * *" },
      targets: [target("npm-g", "typescript")],
    });
    const h = harness({ schedules: [everyMinute, schedule()] });

    expect(await h.run.tick()).toMatchObject({ kind: "ran" });

    expect(h.requests.flat().map((request) => request.packageId)).toEqual(["Git.Git"]);
    expect(h.state.current.schedules["0badf00d"]).toEqual({ lastAttemptAt: YESTERDAY });
    expect(records).toContainEqual([
      "warn",
      "scheduler.schedule-invalid",
      { scheduleId: "0badf00d", issues: [`recurrence: ${TOO_FREQUENT}`] },
    ]);
  });

  it("takes no batch when every enabled schedule is invalid, the heartbeat still written", async () => {
    const everyFiveMinutes = schedule({ recurrence: { kind: "cron", expression: "*/5 * * * *" } });
    const h = harness({ schedules: [everyFiveMinutes] });
    expect(await h.run.tick()).toEqual({ kind: "idle" });
    expect(h.batch.taken).toBe(0);
    expect(h.state.current.lastTickAt).toBe(TICK_AT.toISOString());
  });

  it("runs a leap-day schedule on its day, though its next occurrence is four years away", async () => {
    const leapDay = schedule({ recurrence: { kind: "cron", expression: "0 9 29 2 *" } });
    const h = harness({ schedules: [leapDay] });
    h.clock.now = new Date("2028-02-29T09:05:00Z");

    expect(await h.run.tick()).toMatchObject({ kind: "ran" });
    expect(h.requests.flat().map((request) => request.packageId)).toEqual(["Git.Git"]);
  });

  it("writes the heartbeat but consumes nothing when another run holds the batch", async () => {
    const h = harness({ busy: true });
    expect(await h.run.tick()).toEqual({
      kind: "busy",
      holder: { kind: "interactive", pid: 42, startedAt: "x" },
    });
    expect(h.state.current).toEqual({
      ...seenYesterday("a1b2c3d4"),
      lastTickAt: "2026-10-05T09:05:00.000Z",
    });
    expect(h.scanned).toEqual([]);
  });

  it("runs a due schedule through the pipeline and records its results", async () => {
    const h = harness({ schedules: [twoTargets] });
    const outcome = await h.run.tick();
    expect(h.scanned).toEqual([["winget", "npm-g"]]);
    expect(h.requests[0]?.map((r) => [r.providerId, r.packageId, r.scheduleId])).toEqual([
      ["winget", "Git.Git", "a1b2c3d4"],
      ["npm-g", "typescript", "a1b2c3d4"],
    ]);
    expect(outcome).toMatchObject({ kind: "ran" });
    expect(h.state.current.schedules["a1b2c3d4"]).toEqual({
      lastAttemptAt: "2026-10-05T09:05:00.000Z",
      lastRun: {
        kind: "on-time",
        status: "success",
        startedAt: "2026-10-05T09:05:00.000Z",
        finishedAt: "2026-10-05T09:05:00.000Z",
        targets: [
          { target: "winget:Git.Git", status: "updated", from: "1.0.0", to: "2.0.0" },
          { target: "npm-g:typescript", status: "updated", from: "1.0.0", to: "2.0.0" },
        ],
      },
    });
    expect(h.batch).toEqual({ taken: 1, released: 1 });
  });

  it("consumes the occurrence before installing anything", async () => {
    let anchorDuringWork: string | undefined;
    const h = harness({
      beforeAttempt: (self) => {
        anchorDuringWork = self.state.current.schedules["a1b2c3d4"]?.lastAttemptAt;
      },
    });
    await h.run.tick();
    expect(anchorDuringWork).toBe("2026-10-05T09:05:00.000Z");
  });

  it("does nothing when nothing is due, and scans nothing", async () => {
    const consumed = { a1b2c3d4: { lastAttemptAt: TICK_AT.toISOString() } };
    const h = harness({ state: { v: 1, schedules: consumed } });
    expect(await h.run.tick()).toEqual({ kind: "idle" });
    expect(h.scanned).toEqual([]);
    expect(h.batch).toEqual({ taken: 1, released: 1 });
  });

  it("records a missed occurrence when catch-up is off", async () => {
    const late = harness({ schedules: [schedule({ options: { catchUp: false } })] });
    late.clock.now = new Date("2026-10-05T11:00:00Z");
    expect(await late.run.tick()).toEqual({ kind: "idle" });
    expect(late.state.current.schedules["a1b2c3d4"]).toMatchObject({
      lastAttemptAt: "2026-10-05T11:00:00.000Z",
      lastRun: { status: "missed", targets: [] },
    });
  });

  it("records the targets settled without installing, once, for the history", async () => {
    const first = schedule({
      id: "aaaaaaaa",
      targets: [target("winget", "Git.Git"), target("brew", "git")],
    });
    const second = schedule({ id: "bbbbbbbb", targets: [target("brew", "git")] });
    const h = harness({ schedules: [first, second] });
    await h.run.tick();
    expect(h.skipped).toEqual([
      {
        providerId: "brew",
        packageId: "git",
        message: "Provider inconnu: brew",
        scheduleId: "aaaaaaaa",
      },
    ]);
  });

  it("gives an offline occurrence back, then reports it failed after the deferrals", async () => {
    const offline: TargetScan = {
      results: [scan("winget", [], { error: "getaddrinfo ENOTFOUND" })],
      available: new Set(["winget"]),
    };
    const h = harness({ scan: offline });
    for (let attempt = 1; attempt <= MAX_DEFERRALS; attempt++) {
      expect(await h.run.tick()).toEqual({ kind: "deferred" });
      expect(h.state.current.schedules["a1b2c3d4"]).toEqual({
        lastAttemptAt: YESTERDAY,
        deferrals: attempt,
      });
    }
    expect(await h.run.tick()).toMatchObject({ kind: "ran" });
    expect(h.state.current.schedules["a1b2c3d4"]).toMatchObject({
      lastAttemptAt: "2026-10-05T09:05:00.000Z",
      lastRun: {
        status: "failed",
        targets: [{ target: "winget:Git.Git", status: "failed", message: SCHEDULED_RUN_MESSAGES.offline }],
      },
    });
    expect(h.state.current.schedules["a1b2c3d4"]?.deferrals).toBeUndefined();
    expect(h.requests).toEqual([]);
  });

  it("starts no install after the deadline", async () => {
    const h = harness({
      schedules: [twoTargets],
      beforeAttempt: (self) => {
        self.clock.now = new Date(self.clock.now.getTime() + 61_000);
      },
    });
    await h.run.tick();
    expect(h.state.current.schedules["a1b2c3d4"]?.lastRun).toMatchObject({
      status: "partial",
      targets: [
        { target: "winget:Git.Git", status: "updated" },
        { target: "npm-g:typescript", status: "skipped", message: SCHEDULED_RUN_MESSAGES.deadline },
      ],
    });
  });

  it("stops on request: kills the install in flight and starts nothing else", async () => {
    const h = harness({
      schedules: [twoTargets],
      outcomes: {
        "winget:Git.Git": outcome("Git.Git", {
          success: false,
          skipped: true,
          message: MANUAL_SKIP_MESSAGE,
        }),
      },
      beforeAttempt: (self) => self.run.stop(),
    });
    await h.run.tick();
    expect(h.interrupt).toHaveBeenCalled();
    expect(h.state.current.schedules["a1b2c3d4"]?.lastRun?.targets).toEqual([
      { target: "winget:Git.Git", status: "skipped", message: SCHEDULED_RUN_MESSAGES.stopped },
      { target: "npm-g:typescript", status: "skipped", message: SCHEDULED_RUN_MESSAGES.stopped },
    ]);
    expect(h.batch.released).toBe(1);
  });

  it("keeps what the stopped install's provider recovered after the stop message", async () => {
    const h = harness({
      schedules: [twoTargets],
      outcomes: {
        "winget:Git.Git": outcome("Git.Git", {
          success: false,
          skipped: true,
          message: `${MANUAL_SKIP_MESSAGE} — version précédente restaurée`,
          recovery: "version précédente restaurée",
        }),
      },
      beforeAttempt: (self) => self.run.stop(),
    });
    await h.run.tick();
    expect(h.state.current.schedules["a1b2c3d4"]?.lastRun?.targets?.[0]).toEqual({
      target: "winget:Git.Git",
      status: "skipped",
      message: `${SCHEDULED_RUN_MESSAGES.stopped} — version précédente restaurée`,
    });
  });

  it("drops the state of schedules that no longer exist", async () => {
    const h = harness({
      state: { v: 1, schedules: { a1b2c3d4: { lastAttemptAt: YESTERDAY }, deadbeef: {} } },
    });
    await h.run.tick();
    expect(Object.keys(h.state.current.schedules)).toEqual(["a1b2c3d4"]);
  });
});
