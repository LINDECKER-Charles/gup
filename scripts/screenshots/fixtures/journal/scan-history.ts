import type { ScanEvent, ScanProviderRecord } from "../../../../src/core/history/types.js";
import { SCAN_FIXTURE, SCOOP_ERROR } from "../scan.js";
import { SCHEDULES_FIXTURE, type FixtureSchedule } from "../schedules/schedule-data.js";
import { atLocalTime, type FixtureDay } from "./fixture-days.js";
import { envelope, scheduledSession, sessionOf } from "./history-envelope.js";

/** The morning scan, every day the user used gup. */
const SCAN_TIME = { hour: 9, minute: 0 } as const;
/**
 * oss-docs §4.3.4: `outdated = 3 + (day × 7) mod 9`,
 * `durationMs = 4000 + (day × 137) mod 3000`.
 */
const OUTDATED = { base: 3, step: 7, modulo: 9 } as const;
const DURATION = { base: 4_000, step: 137, modulo: 3_000 } as const;
/** A provider's own scan time varies around the fixture scan's, ± this. */
const PROVIDER_JITTER_MS = 200;
const JITTER_STEP = 31;
const PROVIDER_STEP = 53;
/** Scoop's scan fails one active day in this many, as it does in the fixture scan. */
const SCOOP_FAILS_EVERY = 11;
/** A scheduled run scans only its targets' providers: a few seconds. */
const SCHEDULED_SCAN_MS = 3_400;

/** The providers whose scans find something: what the outdated count spreads over. */
const OUTDATED_PROVIDERS: readonly string[] = SCAN_FIXTURE.results
  .filter((result) => result.packages.length > 0)
  .map((result) => result.providerId);

/**
 * Every scan of the year: the morning one of each active day — today's
 * being the fixture scan itself, so the Journal's latest numbers are those
 * of Packages — and the targeted scans of the schedules' last runs.
 */
export function scanHistory(days: readonly FixtureDay[]): ScanEvent[] {
  const today = days.at(-1);
  return [
    ...days.filter((day) => day.isActive).map((day) => morningScan(day, day === today)),
    ...SCHEDULES_FIXTURE.map(scheduledScan),
  ];
}

function morningScan(day: FixtureDay, isToday: boolean): ScanEvent {
  const providers = isToday ? fixtureScanProviders() : dailyProviders(day.index);
  return {
    ...envelope(atLocalTime(day, SCAN_TIME), sessionOf(day)),
    kind: "scan",
    durationMs: DURATION.base + ((day.index * DURATION.step) % DURATION.modulo),
    fast: false,
    filter: [],
    providers,
    outdated: providers.reduce((total, provider) => total + provider.outdated, 0),
  };
}

/** The fixture scan as the history records it: what Packages shows. */
function fixtureScanProviders(): ScanProviderRecord[] {
  return SCAN_FIXTURE.steps.map(({ providerId, ms }) => {
    const result = SCAN_FIXTURE.results.find((candidate) => candidate.providerId === providerId);
    return {
      providerId,
      outdated: result?.packages.length ?? 0,
      ...(result?.error !== undefined && { error: result.error }),
      durationMs: ms,
    };
  });
}

/** Day `index`'s scan: the fixture's providers, the day's outdated count spread over them. */
function dailyProviders(index: number): ScanProviderRecord[] {
  const outdated = OUTDATED.base + ((index * OUTDATED.step) % OUTDATED.modulo);
  const isScoopDown = index % SCOOP_FAILS_EVERY === 0;
  return SCAN_FIXTURE.steps.map(({ providerId, ms }, order) => {
    const share = OUTDATED_PROVIDERS.indexOf(providerId);
    const jitter = (index * JITTER_STEP + order * PROVIDER_STEP) % (2 * PROVIDER_JITTER_MS);
    return {
      providerId,
      outdated: share === -1 ? 0 : spread(outdated, share),
      ...(isScoopDown && providerId === "scoop" && { error: SCOOP_ERROR }),
      durationMs: ms - PROVIDER_JITTER_MS + jitter,
    };
  });
}

/** Provider `share`'s part of `total`, spread as evenly as whole numbers allow. */
function spread(total: number, share: number): number {
  const count = OUTDATED_PROVIDERS.length;
  return Math.floor(total / count) + (share < total % count ? 1 : 0);
}

/**
 * A schedule's last run scans only the providers of its targets; a failed
 * run is one whose scans all failed (the network was down).
 */
function scheduledScan({ id, draft, lastRun }: FixtureSchedule): ScanEvent {
  const providerIds = [...new Set(draft.targets.map((target) => target.providerId))];
  const failure = lastRun.status === "failed" ? lastRun.targets[0]?.message : undefined;
  const updated = lastRun.targets.filter((target) => target.status === "updated");
  const providers = providerIds.map((providerId) => ({
    providerId,
    outdated: updated.filter((target) => target.target.startsWith(`${providerId}:`)).length,
    ...(failure !== undefined && { error: failure }),
  }));
  const startedAt = new Date(lastRun.startedAt);
  return {
    ...envelope(startedAt, scheduledSession(startedAt, id)),
    kind: "scan",
    durationMs: SCHEDULED_SCAN_MS,
    fast: false,
    filter: providerIds,
    providers,
    outdated: providers.reduce((total, provider) => total + provider.outdated, 0),
  };
}
