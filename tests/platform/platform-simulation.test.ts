import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isSupportedOn } from "../../src/core/platform/is-supported-on.js";
import { ALL_PROVIDERS } from "../../src/core/registry.js";
import type { OutdatedPackage, Provider } from "../../src/core/types.js";
import {
  formatViolation,
  outcomeViolations,
  rowViolations,
  shellViolations,
  unwaived,
} from "../support/contract/invariants.js";
import { caseLabel, installSpawns, SYNTHETIC_ROWS } from "../support/contract/scenario.js";
import type { ProviderContractCase, Violation, Waiver } from "../support/contract/types.js";
import { system } from "../support/system/fake-system.js";
import type { SimPlatform, SystemSpec } from "../support/system/types.js";
import { loadContractCases, type DomainCase } from "./contract-cases.js";
import { rebaseSystem } from "./rebase-machine.js";

/**
 * macOS and Linux from Windows, and the other way round: every contract case
 * replayed on each other OS its provider supports, and every registered
 * provider on a machine where everything answers, on each OS it supports.
 * Nothing may reject — not a probe, a scan, an update or a batch — and what
 * comes back must keep the row and outcome invariants. The rows themselves
 * may differ: a provider on another OS looks elsewhere and finds other
 * things. The golden per-OS sets and the detection gate are pinned in
 * tests/core/platform/provider-platforms.test.ts, not here.
 */

const SIMULATED: readonly SimPlatform[] = ["win32", "darwin", "linux"];
const CASES = await loadContractCases();

beforeEach(() => {
  // A few updates print their progress (Nerd Fonts' downloads).
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** The OSes `provider` supports among the simulated ones. */
function supportedOn(provider: Provider): SimPlatform[] {
  return SIMULATED.filter((platform) => isSupportedOn(provider, platform));
}

/** What a call rejected with, as a violation line. */
function rejection(call: string, error: unknown): string {
  return `${call} rejected: ${error instanceof Error ? error.message : String(error)}`;
}

interface Exercise {
  readonly create: () => Provider;
  readonly waivers: readonly Waiver[];
  /** The package `update()` is asked for; default the first row, else a synthetic one. */
  readonly packageId?: string;
}

/** Scan: rows, or the rejection; plus the rows' broken invariants. */
async function scan(provider: Provider, problems: string[]): Promise<OutdatedPackage[]> {
  try {
    await provider.isAvailable();
  } catch (error) {
    problems.push(rejection("isAvailable()", error));
  }
  try {
    const rows = await provider.listOutdated();
    problems.push(...rowViolations(rows).map(formatViolation));
    return rows;
  } catch (error) {
    problems.push(rejection("listOutdated()", error));
    return [];
  }
}

/**
 * Every call the registry and the update pipeline make, and what broke. An
 * update of an id the scan never listed (nothing listed, no declared update)
 * only has to resolve: a single-tool provider answers for its own id.
 */
async function exercise({ create, waivers, packageId }: Exercise): Promise<string[]> {
  const problems: string[] = [];
  const provider = create();
  const rows = await scan(provider, problems);
  const listed = packageId ?? rows[0]?.id;
  const target = listed ?? SYNTHETIC_ROWS[0]!.id;
  const violations: Violation[] = [];
  try {
    const outcome = await provider.update(target);
    if (listed !== undefined) violations.push(...outcomeViolations(outcome, listed));
    violations.push(...shellViolations(installSpawns(system.trace)));
  } catch (error) {
    problems.push(rejection(`update(${JSON.stringify(target)})`, error));
  }
  try {
    const outcomes = await provider.updateAll(rows.length > 0 ? rows : [...SYNTHETIC_ROWS]);
    if (!Array.isArray(outcomes)) problems.push("updateAll() resolved no list of outcomes");
  } catch (error) {
    problems.push(rejection("updateAll()", error));
  }
  return [...problems, ...unwaived(violations, waivers).map(formatViolation)];
}

/** Load `spec` in explore mode: what nobody scripted fails, as on a real machine. */
async function exploring(spec: SystemSpec): Promise<void> {
  await system.load(spec);
  system.explore(true);
}

const REPLAYS = CASES.flatMap(({ source, case: contractCase }: DomainCase) => {
  const label = `${source} › ${caseLabel(contractCase)}`;
  return supportedOn(contractCase.create())
    .filter((platform) => platform !== contractCase.system.platform)
    .map((platform) => [`${label} on ${platform}`, contractCase, platform] as const);
});

describe("every contract case on the other OSes its provider supports", () => {
  it.each(REPLAYS)("%s", async (_label, contractCase: ProviderContractCase, platform) => {
    await exploring(rebaseSystem(contractCase.system, platform));
    const problems = await exercise({
      create: contractCase.create,
      waivers: contractCase.waivers ?? [],
      ...(contractCase.update && { packageId: contractCase.update.packageId }),
    });
    expect(problems).toEqual([]);
  });
});

/** Each provider's waivers, gathered from its cases (gcloud answers for itself, …). */
const WAIVERS = new Map<string, Waiver[]>();
for (const { case: contractCase } of CASES) {
  const id = contractCase.create().id;
  WAIVERS.set(id, [...(WAIVERS.get(id) ?? []), ...(contractCase.waivers ?? [])]);
}

const PERMISSIVE = ALL_PROVIDERS.flatMap((provider) =>
  supportedOn(provider).map(
    (platform) => [`${provider.id} on ${platform}`, provider, platform] as const,
  ),
);

describe("every registered provider where every probe answers", () => {
  it.each(PERMISSIVE)("%s", async (_label, registered: Provider, platform) => {
    await exploring({ platform, permissive: true });
    // Built once the OS is simulated: an install hint is picked at construction.
    const create = () => new (registered.constructor as new () => Provider)();
    const problems = await exercise({ create, waivers: WAIVERS.get(registered.id) ?? [] });
    expect(problems).toEqual([]);
  });
});

describe("contract coverage", () => {
  it("has a contract case for every registered provider", () => {
    const covered = new Set(CASES.map(({ case: contractCase }) => contractCase.create().id));
    const uncovered = ALL_PROVIDERS.map((provider) => provider.id).filter((id) => !covered.has(id));
    expect(uncovered).toEqual([]);
  });
});
