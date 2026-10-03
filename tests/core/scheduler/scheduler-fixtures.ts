import type {
  ProviderFact,
  ProviderFacts,
  Schedule,
  ScheduleTarget,
} from "../../../src/core/scheduler/model/types.js";

/**
 * Builders for the scheduler suites: the smallest valid value, every field
 * overridable, so a test spells out only what it is about.
 */

export const CREATED_AT = "2026-09-01T08:00:00.000Z";

/** A daily 09:00 schedule of `winget:Git.Git`, enabled, catch-up on, armed on 1 Sept. */
export function schedule(overrides: Partial<Schedule> = {}): Schedule {
  return {
    id: "a1b2c3d4",
    name: "Outils dev",
    recurrence: { kind: "daily", at: { hour: 9, minute: 0 } },
    targets: [target("winget", "Git.Git")],
    enabled: true,
    options: { catchUp: true },
    createdAt: CREATED_AT,
    armedAt: CREATED_AT,
    ...overrides,
  };
}

export function target(providerId: string, packageId: string): ScheduleTarget {
  return { providerId, packageId };
}

/**
 * Provider facts for a fake registry: every id listed is known and can
 * update unattended unless overridden; any other id is unknown.
 */
export function providerFacts(
  known: Readonly<Record<string, Partial<Extract<ProviderFact, { isFound: true }>>>>,
): ProviderFacts {
  return {
    lookup(providerId) {
      const fact = known[providerId];
      if (!fact) return { isFound: false, error: `Provider inconnu: ${providerId}` };
      return { isFound: true, displayName: providerId, canUpdateUnattended: true, ...fact };
    },
  };
}
