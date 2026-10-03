import type { OutdatedPackage } from "../../types.js";

/**
 * The scheduler's domain. A schedule names packages — `provider:packageId`
 * targets — and when to update them; it can never designate a whole
 * provider. Type-only module, like `core/types.ts`.
 */

export interface TimeOfDay {
  readonly hour: number;
  readonly minute: number;
}

/** Cron convention: 0 = Sunday … 6 = Saturday. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** A day of the month (1–28, valid in every month) or its last day. */
export type MonthDay = number | "last";

export type Recurrence =
  | { readonly kind: "daily"; readonly at: TimeOfDay }
  | { readonly kind: "weekly"; readonly weekday: Weekday; readonly at: TimeOfDay }
  | { readonly kind: "monthly"; readonly day: MonthDay; readonly at: TimeOfDay }
  | { readonly kind: "cron"; readonly expression: string };

export interface ScheduleTarget {
  readonly providerId: string;
  /** One package of that provider: never empty, never a wildcard. */
  readonly packageId: string;
  /** Display name captured when the target was picked from a scan, for lists only. */
  readonly label?: string;
}

export interface ScheduleOptions {
  /** Run once at the next opportunity when occurrences were missed. */
  readonly catchUp: boolean;
}

export interface Schedule {
  /** 8 lowercase hex characters. */
  readonly id: string;
  readonly name: string;
  /** The cron expression is always derived from it (`toCron`). */
  readonly recurrence: Recurrence;
  readonly targets: readonly ScheduleTarget[];
  readonly enabled: boolean;
  readonly options: ScheduleOptions;
  /** ISO 8601, UTC. */
  readonly createdAt: string;
  /**
   * Occurrences before this instant never count, so creating, re-timing or
   * re-enabling a schedule never replays the past. ISO 8601, UTC.
   */
  readonly armedAt: string;
}

/** What a user edits: everything but the identity and the bookkeeping dates. */
export type ScheduleDraft = Pick<
  Schedule,
  "name" | "recurrence" | "targets" | "enabled" | "options"
>;

export type TargetStatus = "updated" | "no-update" | "failed" | "skipped";

export interface TargetResult {
  /** `provider:packageId`, as the schedule spells it. */
  readonly target: string;
  readonly status: TargetStatus;
  readonly from?: string;
  readonly to?: string;
  /** French, user-facing. */
  readonly message?: string;
}

export type RunKind = "on-time" | "catch-up" | "manual";

export type RunStatus = "success" | "partial" | "failed" | "skipped" | "up-to-date" | "missed";

export interface ScheduleRunRecord {
  readonly kind: RunKind;
  readonly status: RunStatus;
  /** ISO 8601, UTC. */
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly targets: readonly TargetResult[];
}

export interface ScheduleRunState {
  /** Anchor of the due computation: when the last occurrence was consumed. */
  readonly lastAttemptAt?: string;
  /** Consecutive "every scan failed" postponements of the pending occurrence. */
  readonly deferrals?: number;
  readonly lastRun?: ScheduleRunRecord;
}

export interface SchedulerState {
  readonly v: 1;
  /** Heartbeat: the last tick that found something enabled. ISO 8601, UTC. */
  readonly lastTickAt?: string;
  readonly schedules: Readonly<Record<string, ScheduleRunState>>;
}

/** What validation and planning need to know about a provider id on this machine. */
export type ProviderFact =
  | {
      readonly isFound: true;
      readonly displayName: string;
      /** False when every update needs sudo or UAC, which nobody grants to a scheduled run. */
      readonly canUpdateUnattended: boolean;
    }
  | { readonly isFound: false; readonly error: string };

export interface ProviderFacts {
  lookup(providerId: string): ProviderFact;
}

/**
 * One package a run will update: the scan's row — whose id is what reaches
 * `update()`, never the stored string — and every target and schedule that
 * asked for it (two schedules may list the same package).
 */
export interface ScheduledTarget {
  readonly providerId: string;
  readonly pkg: OutdatedPackage;
  /** Target keys settled by this update, as each schedule spells them. */
  readonly targets: readonly string[];
  readonly scheduleIds: readonly string[];
}

/** What a run will do, decided before anything is installed. */
export interface TickPlan {
  readonly updates: readonly ScheduledTarget[];
  /** Targets settled without an install (nothing to update, or skipped), by target key. */
  readonly resolved: ReadonlyMap<string, TargetResult>;
  /** Every needed provider that is installed failed to scan: most likely offline. */
  readonly isEnvironmentDown: boolean;
}
