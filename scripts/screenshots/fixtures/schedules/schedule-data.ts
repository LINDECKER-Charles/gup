import type {
  ScheduleDraft,
  ScheduleRunRecord,
} from "../../../../src/core/scheduler/model/types.js";

/** One schedule of the fixture machine, with its last run as the run state keeps it. */
export interface FixtureSchedule {
  /** Deterministic: 8 lowercase hex characters, as the repository makes them. */
  readonly id: string;
  readonly draft: ScheduleDraft;
  /** When the user created it (ISO 8601, UTC). */
  readonly createdAt: string;
  readonly lastRun: ScheduleRunRecord;
}

const AT_NINE = { hour: 9, minute: 0 } as const;
const MONDAY = 1;
const NETWORK_DOWN = "réseau indisponible";

/**
 * The fixture machine's three schedules: its dev tools every Monday, Git
 * every night, the Rust tools once a month — the last of which failed for
 * want of a network. Times are UTC: 07:00Z is 09:00 in Paris in September.
 */
export const SCHEDULES_FIXTURE: readonly FixtureSchedule[] = [
  {
    id: "a1b2c3d4",
    draft: {
      name: "Outils dev",
      recurrence: { kind: "weekly", weekday: MONDAY, at: AT_NINE },
      targets: [
        { providerId: "npm-g", packageId: "typescript", label: "typescript" },
        { providerId: "npm-g", packageId: "pnpm", label: "pnpm" },
        { providerId: "pipx", packageId: "ruff", label: "ruff" },
      ],
      enabled: true,
      options: { catchUp: true },
    },
    createdAt: "2026-06-01T16:42:10.000Z",
    lastRun: {
      kind: "on-time",
      status: "success",
      startedAt: "2026-09-14T07:00:04.000Z",
      finishedAt: "2026-09-14T07:01:12.000Z",
      targets: [
        { target: "npm-g:typescript", status: "updated", from: "6.0.1", to: "6.0.2" },
        { target: "npm-g:pnpm", status: "updated", from: "10.16.9", to: "10.17.0" },
        { target: "pipx:ruff", status: "updated", from: "0.12.9", to: "0.13.0" },
      ],
    },
  },
  {
    id: "b2c3d4e5",
    draft: {
      name: "Git",
      recurrence: { kind: "daily", at: { hour: 3, minute: 0 } },
      targets: [{ providerId: "winget", packageId: "Git.Git", label: "Git" }],
      enabled: true,
      options: { catchUp: true },
    },
    createdAt: "2026-07-03T19:05:44.000Z",
    lastRun: {
      kind: "on-time",
      status: "up-to-date",
      startedAt: "2026-09-15T01:00:03.000Z",
      finishedAt: "2026-09-15T01:00:21.000Z",
      targets: [{ target: "winget:Git.Git", status: "no-update" }],
    },
  },
  {
    id: "c3d4e5f6",
    draft: {
      name: "Rust",
      recurrence: { kind: "monthly", day: 1, at: { hour: 12, minute: 0 } },
      targets: [
        { providerId: "cargo", packageId: "ripgrep", label: "ripgrep" },
        { providerId: "cargo", packageId: "bat", label: "bat" },
      ],
      enabled: true,
      options: { catchUp: true },
    },
    createdAt: "2026-07-20T08:31:02.000Z",
    lastRun: {
      kind: "on-time",
      status: "failed",
      startedAt: "2026-09-01T10:00:02.000Z",
      finishedAt: "2026-09-01T10:00:09.000Z",
      targets: [
        { target: "cargo:ripgrep", status: "failed", message: NETWORK_DOWN },
        { target: "cargo:bat", status: "failed", message: NETWORK_DOWN },
      ],
    },
  },
];
