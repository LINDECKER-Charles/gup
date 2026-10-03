import { describe, expect, it } from "vitest";
import { evaluateDue, type DueVerdict } from "../../../src/core/scheduler/model/due.js";
import type { Schedule, ScheduleRunState } from "../../../src/core/scheduler/model/types.js";
import { ON_TIME_GRACE_MS } from "../../../src/core/scheduler/scheduler-timing.js";
import { schedule } from "./scheduler-fixtures.js";

// Daily 09:00 (TZ=UTC), ticks every 15 minutes, 30 minutes of on-time grace.
const policy = { onTimeGraceMs: ON_TIME_GRACE_MS };

function due(
  at: string,
  options: { readonly schedule?: Schedule; readonly state?: ScheduleRunState } = {},
): DueVerdict {
  return evaluateDue(
    { schedule: options.schedule ?? schedule(), state: options.state, now: new Date(at) },
    policy,
  );
}

const date = (iso: string): Date => new Date(iso);

describe("evaluateDue", () => {
  it("is not due right after creation, even past today's time", () => {
    const created = schedule({ armedAt: "2026-10-05T10:05:00.000Z" });
    expect(due("2026-10-05T10:15:00Z", { schedule: created })).toEqual({
      kind: "not-due",
      nextRun: date("2026-10-06T09:00:00Z"),
    });
  });

  it("runs on time at the first tick after the occurrence", () => {
    const state = { lastAttemptAt: "2026-10-04T09:12:00.000Z" };
    expect(due("2026-10-05T09:12:00Z", { state })).toEqual({
      kind: "due",
      runKind: "on-time",
      occurrence: date("2026-10-05T09:00:00Z"),
    });
  });

  it("is not due again once the occurrence was consumed", () => {
    const state = { lastAttemptAt: "2026-10-05T09:12:00.000Z" };
    expect(due("2026-10-05T09:27:00Z", { state })).toEqual({
      kind: "not-due",
      nextRun: date("2026-10-06T09:00:00Z"),
    });
  });

  it("collapses days of missed occurrences into one catch-up run", () => {
    // Machine off from Monday 08:00 to Wednesday 10:40.
    const state = { lastAttemptAt: "2026-10-04T09:05:00.000Z" };
    expect(due("2026-10-07T10:45:00Z", { state })).toEqual({
      kind: "due",
      runKind: "catch-up",
      occurrence: date("2026-10-07T09:00:00Z"),
    });
  });

  it("records the occurrence as missed when catch-up is off", () => {
    const noCatchUp = schedule({ options: { catchUp: false } });
    const state = { lastAttemptAt: "2026-10-04T09:05:00.000Z" };
    expect(due("2026-10-07T10:45:00Z", { schedule: noCatchUp, state })).toEqual({
      kind: "missed",
      occurrence: date("2026-10-07T09:00:00Z"),
    });
  });

  it("does not replay the old occurrences after a re-arm (edit, re-enable)", () => {
    const rearmed = schedule({ armedAt: "2026-11-05T12:00:00.000Z" });
    const state = { lastAttemptAt: "2026-10-04T09:05:00.000Z" };
    expect(due("2026-11-05T12:10:00Z", { schedule: rearmed, state })).toEqual({
      kind: "not-due",
      nextRun: date("2026-11-06T09:00:00Z"),
    });
  });

  it("is never due while disabled", () => {
    const disabled = schedule({ enabled: false });
    expect(due("2026-10-05T09:12:00Z", { schedule: disabled })).toEqual({
      kind: "not-due",
      nextRun: null,
    });
  });

  it("survives a clock set backwards: the anchor never moves past now", () => {
    // The last attempt lies in the "future" of a clock moved back a day.
    const state = { lastAttemptAt: "2026-10-06T09:05:00.000Z" };
    expect(due("2026-10-05T09:10:00Z", { state })).toEqual({
      kind: "not-due",
      nextRun: date("2026-10-06T09:00:00Z"),
    });
    expect(due("2026-10-07T09:10:00Z", { state })).toMatchObject({ kind: "due" });
  });

  it("counts a late tick within the grace as on time, and beyond it as a catch-up", () => {
    const state = { lastAttemptAt: "2026-10-04T09:05:00.000Z" };
    expect(due("2026-10-05T09:30:00Z", { state })).toMatchObject({ runKind: "on-time" });
    expect(due("2026-10-05T09:31:00Z", { state })).toMatchObject({ runKind: "catch-up" });
  });

  it("never fires for an expression that no longer parses (hand-edited file)", () => {
    const broken = schedule({ recurrence: { kind: "cron", expression: "nope" } });
    expect(due("2026-10-05T09:12:00Z", { schedule: broken })).toEqual({
      kind: "not-due",
      nextRun: null,
    });
  });
});
