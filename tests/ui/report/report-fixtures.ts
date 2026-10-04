import type { HistoryEvent, UpdateEvent, UpdateStatus } from "../../../src/core/history/types.js";
import { buildInsights } from "../../../src/core/insights/build-insights.js";
import { buildReportModel } from "../../../src/core/export/report-model.js";
import type { ReportModel } from "../../../src/core/export/report-types.js";
import type { RunTrigger } from "../../../src/core/state/run-context.js";
import { parsePeriod } from "../../../src/core/time/period.js";
import { periodLabel, periodLead } from "../../../src/ui/text/journal/activity-labels.js";
import { scanEvent, updateEvent } from "../../support/history-fixtures.js";
import { seededRandom } from "../../support/random.js";

/**
 * Report fixtures: a model built the way `gup report` builds it, and a year
 * of believable activity — real package names, weekly browsers, a nightly
 * schedule, an installer that keeps failing, skips, retries with elevation —
 * for the DOM suites and for looking at a generated report.
 */

/** "Now" of the report suites (TZ=UTC in the test environment). */
export const REPORT_NOW = new Date("2026-10-03T12:00:00.000Z");

const PROVIDER_NAMES: Readonly<Record<string, string>> = {
  winget: "Windows Package Manager",
  "npm-g": "npm (global)",
  pip: "pip",
  choco: "Chocolatey",
  scoop: "Scoop",
  cargo: "cargo",
  "pwsh-modules": "PowerShell modules",
};

export const nameOf = (providerId: string): string => PROVIDER_NAMES[providerId] ?? providerId;

export function reportModelOf(events: readonly HistoryEvent[], period = "12m"): ReportModel {
  const parsed = parsePeriod(period, REPORT_NOW);
  if (parsed === null) throw new RangeError(`bad period ${period}`);
  return buildReportModel({
    events,
    insights: buildInsights(events, { period: parsed }),
    stats: { files: 1, lines: events.length, malformed: 0, unsupported: 0 },
    context: {
      now: REPORT_NOW,
      nameOf,
      period: { label: periodLabel(parsed), lead: periodLead(parsed) },
      gup: "0.5.0",
      platform: "win32",
      timeZone: "UTC",
    },
  });
}

interface PackageSpec {
  readonly provider: string;
  readonly id: string;
  /** Days between two releases. */
  readonly every: number;
  readonly failRate?: number;
  readonly skipRate?: number;
  readonly message?: string;
}

const PACKAGES: readonly PackageSpec[] = [
  { provider: "winget", id: "Google.Chrome", every: 8 },
  { provider: "winget", id: "Microsoft.Edge", every: 11 },
  { provider: "winget", id: "Microsoft.VisualStudioCode", every: 30 },
  { provider: "winget", id: "Git.Git", every: 42 },
  { provider: "winget", id: "7zip.7zip", every: 110 },
  { provider: "winget", id: "Spotify.Spotify", every: 21, skipRate: 0.5 },
  { provider: "npm-g", id: "typescript", every: 34 },
  { provider: "npm-g", id: "npm", every: 26 },
  { provider: "npm-g", id: "pnpm", every: 17 },
  { provider: "npm-g", id: "@angular/cli", every: 24 },
  { provider: "pip", id: "requests", every: 75 },
  { provider: "pip", id: "black", every: 45 },
  {
    provider: "choco",
    id: "nodejs",
    every: 30,
    failRate: 0.55,
    message:
      "Exit code 1603 — the MSI installer reported a fatal error.\n" +
      "See C:\\ProgramData\\chocolatey\\logs\\chocolatey.log for details.",
  },
  { provider: "scoop", id: "ripgrep", every: 60 },
  { provider: "scoop", id: "fzf", every: 52 },
  { provider: "cargo", id: "cargo-edit", every: 95 },
  {
    provider: "pwsh-modules",
    id: "PSReadLine",
    every: 100,
    failRate: 0.4,
    message: "Install-Module : Administrator rights are required to install modules in 'AllUsers'.",
  },
];

const SCAN_MS: Readonly<Record<string, number>> = {
  winget: 12_400,
  "npm-g": 3_100,
  pip: 2_600,
  choco: 4_200,
  scoop: 1_800,
  cargo: 900,
  "pwsh-modules": 9_100,
};

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const YEAR_DAYS = 365;

interface PackageState {
  readonly spec: PackageSpec;
  version: [number, number, number];
  releasedAt: number;
  installedRelease: number;
}

interface Simulation {
  readonly random: () => number;
  readonly packages: PackageState[];
  readonly events: HistoryEvent[];
  sessions: number;
}

/** A year of activity ending at {@link REPORT_NOW}, the same on every run. */
export function realisticHistory(seed = 7): HistoryEvent[] {
  // Midnight UTC a year ago: sessions keep their hour of the day.
  const start = Math.floor(REPORT_NOW.getTime() / DAY_MS - YEAR_DAYS) * DAY_MS;
  const simulation: Simulation = {
    random: seededRandom(seed),
    packages: PACKAGES.map((spec, index) => ({
      spec,
      version: [1 + (index % 4), index % 7, 0],
      releasedAt: 0,
      installedRelease: 0,
    })),
    events: [],
    sessions: 0,
  };
  for (let day = 0; day < YEAR_DAYS; day++) {
    const dayStart = start + day * DAY_MS;
    release(simulation, day);
    if (simulation.random() < 0.42) session(simulation, dayStart);
  }
  return simulation.events
    .filter((event) => Date.parse(event.ts) <= REPORT_NOW.getTime())
    .sort((a, b) => a.ts.localeCompare(b.ts));
}

/** Packages publish a new version every `every` days, give or take. */
function release(simulation: Simulation, day: number): void {
  for (const entry of simulation.packages) {
    const isDue = day - entry.releasedAt >= entry.spec.every * (0.7 + simulation.random() * 0.6);
    if (!isDue) continue;
    entry.releasedAt = day;
    entry.version = [entry.version[0], entry.version[1] + 1, Math.floor(simulation.random() * 9)];
  }
}

function session(simulation: Simulation, dayStart: number): void {
  const { random } = simulation;
  simulation.sessions++;
  const trigger: RunTrigger = random() < 0.2 ? "schedule" : random() < 0.75 ? "menu" : "cli";
  const startHour = trigger === "schedule" ? 3 : 8 + Math.floor(random() * 12);
  const runId = `run-${String(simulation.sessions).padStart(4, "0")}-${Math.floor(random() * 1e6)}`;
  let at = dayStart + startHour * HOUR_MS + Math.floor(random() * HOUR_MS);
  const outdated = simulation.packages.filter((entry) => entry.installedRelease < entry.releasedAt);
  simulation.events.push(
    scanEvent({
      ts: new Date(at).toISOString(),
      runId,
      trigger,
      fast: random() < 0.1,
      durationMs: 14_000 + Math.floor(random() * 9_000),
      providers: Object.keys(SCAN_MS).map((providerId) => ({
        providerId,
        outdated: outdated.filter((entry) => entry.spec.provider === providerId).length,
        durationMs: Math.round((SCAN_MS[providerId] ?? 1_000) * (0.8 + random() * 0.5)),
      })),
    }),
  );
  for (const entry of outdated) {
    if (random() < 0.15) continue;
    at += 20_000 + Math.floor(random() * 60_000);
    simulation.events.push(...attempts(simulation, entry, { at, runId, trigger }));
  }
}

interface AttemptContext {
  readonly at: number;
  readonly runId: string;
  readonly trigger: RunTrigger;
}

function attempts(
  simulation: Simulation,
  entry: PackageState,
  context: AttemptContext,
): UpdateEvent[] {
  const status = outcome(simulation.random, entry.spec);
  const first = attempt(entry, status, context);
  if (status !== "failed" || simulation.random() < 0.6) {
    if (status === "success") entry.installedRelease = entry.releasedAt;
    return [first];
  }
  // A retry with administrator rights, a minute later: it works most of the time.
  const retryStatus: UpdateStatus = simulation.random() < 0.7 ? "success" : "failed";
  if (retryStatus === "success") entry.installedRelease = entry.releasedAt;
  const retry = attempt(entry, retryStatus, { ...context, at: context.at + 60_000 });
  return [first, { ...retry, retry: "élévation", elevated: true }];
}

function outcome(random: () => number, spec: PackageSpec): UpdateStatus {
  const draw = random();
  if (draw < (spec.failRate ?? 0.03)) return "failed";
  if (draw < (spec.failRate ?? 0.03) + (spec.skipRate ?? 0.02)) return "skipped";
  return "success";
}

function attempt(entry: PackageState, status: UpdateStatus, context: AttemptContext): UpdateEvent {
  const [major, minor, patch] = entry.version;
  const message =
    status === "failed"
      ? (entry.spec.message ?? "Exit code 1: the download was interrupted.")
      : status === "skipped"
        ? "ignorée par l'utilisateur"
        : undefined;
  return updateEvent(entry.spec.provider, entry.spec.id, {
    ts: new Date(context.at).toISOString(),
    runId: context.runId,
    trigger: context.trigger,
    status,
    from: `${major}.${Math.max(0, minor - 1)}.${patch}`,
    to: `${major}.${minor}.${patch}`,
    durationMs: 4_000 + Math.floor((minor * 7_919 + patch * 104_729) % 70_000),
    ...(message !== undefined && { message }),
    ...(context.trigger === "schedule" && { scheduleId: "sched-nightly" }),
  });
}
