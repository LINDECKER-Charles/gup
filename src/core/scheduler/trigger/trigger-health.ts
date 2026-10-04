import type { InstallRecord } from "../persistence/install-record.js";
import { HEARTBEAT_STALE_MINUTES } from "../scheduler-timing.js";
import type { TriggerStatus } from "./os-trigger.js";
import type { RegistrationMatch } from "./trigger-sync.js";

/**
 * One verdict on the OS trigger for everything that reports it — `gup
 * schedule list` and `status`, `gup doctor`, the menu. Pure: the facts are
 * gathered by the caller. The order of the checks is the order a user can
 * act on them: nothing to run, nothing registered, switched off, registered
 * for another gup, registered for an older path, silent, fine.
 */

export type TriggerHealth =
  | { readonly kind: "none" }
  | { readonly kind: "not-installed" }
  | { readonly kind: "disabled-by-user" }
  | { readonly kind: "foreign"; readonly entry: string }
  | { readonly kind: "outdated" }
  | { readonly kind: "stale"; readonly since: Date }
  | { readonly kind: "active"; readonly lastTickAt: Date | null };

export interface HealthFacts {
  readonly enabledCount: number;
  readonly record: InstallRecord | null;
  readonly status: TriggerStatus;
  /** How the record relates to the running gup; null when unknown. */
  readonly match: RegistrationMatch | null;
  /** Heartbeat of the last tick, ISO 8601. */
  readonly lastTickAt: string | undefined;
  readonly now: Date;
  /** `os.uptime()`: right after boot, silence is expected. */
  readonly uptimeSeconds: number;
}

const MINUTE_MS = 60_000;
const SECONDS_PER_MINUTE = 60;

export function assessTrigger(facts: HealthFacts): TriggerHealth {
  if (facts.enabledCount === 0) return { kind: "none" };
  const { record, status } = facts;
  if (!record || !status.isInstalled) return { kind: "not-installed" };
  return registrationProblem(record, facts) ?? heartbeatOf(record, facts);
}

function registrationProblem(record: InstallRecord, facts: HealthFacts): TriggerHealth | null {
  if (facts.status.isDisabledByUser) return { kind: "disabled-by-user" };
  if (facts.match === "foreign") return { kind: "foreign", entry: record.argv[1] ?? "" };
  if (facts.match === "drift") return { kind: "outdated" };
  return null;
}

function heartbeatOf(record: InstallRecord, facts: HealthFacts): TriggerHealth {
  const lastTick = dateOf(facts.lastTickAt);
  const reference = lastTick ?? dateOf(record.installedAt);
  if (reference && isSilent(reference, facts)) return { kind: "stale", since: reference };
  return { kind: "active", lastTickAt: lastTick };
}

/** No tick for three intervals, on a machine up long enough to have had them. */
function isSilent(reference: Date, facts: HealthFacts): boolean {
  const staleMs = HEARTBEAT_STALE_MINUTES * MINUTE_MS;
  const isUpLongEnough = facts.uptimeSeconds > HEARTBEAT_STALE_MINUTES * SECONDS_PER_MINUTE;
  return isUpLongEnough && facts.now.getTime() - reference.getTime() > staleMs;
}

function dateOf(iso: string | undefined): Date | null {
  if (iso === undefined) return null;
  const time = Date.parse(iso);
  return Number.isNaN(time) ? null : new Date(time);
}
