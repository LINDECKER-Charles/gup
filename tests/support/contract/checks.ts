import { isDeepStrictEqual } from "node:util";
import { expect } from "vitest";
import type { OutdatedPackage, UpdateOutcome } from "../../../src/core/types.js";
import { isGoldenRef } from "../fixtures/refs.js";
import { system } from "../system/fake-system.js";
import { formatSweepReport, sweepInstalls, sweepScan, type SweepFinding } from "./fault-sweep.js";
import {
  batchInstallViolations,
  formatViolation,
  outcomeViolations,
  rowViolations,
  shellViolations,
  slowFlagViolations,
  unwaived,
  updateAllViolations,
} from "./invariants.js";
import {
  goldenText,
  inlineRows,
  installSpawns,
  nominalRows,
  providerOn,
  SYNTHETIC_ROWS,
} from "./scenario.js";
import type {
  ProviderContractCase,
  UpdateExpectation,
  UpdateRoute,
  Violation,
} from "./types.js";

/** The bodies of the generated tests, one per contract rule (§ define-contract). */

/** Fail with every problem listed in the message, not hidden in a diff. */
function failOn(problems: readonly string[], header: string): void {
  if (problems.length === 0) return;
  expect.fail([header, ...problems.map((line) => `- ${line}`)].join("\n"));
}

function expectNone(violations: readonly Violation[], contractCase: ProviderContractCase): void {
  const broken = unwaived(violations, contractCase.waivers ?? []);
  failOn(broken.map(formatViolation), `${broken.length} contract violation(s):`);
}

function expectNoFindings(findings: readonly SweepFinding[], providerId: string): void {
  if (findings.length > 0) expect.fail(formatSweepReport(providerId, findings));
}

export async function detectsItself(contractCase: ProviderContractCase): Promise<void> {
  const provider = await providerOn(contractCase);
  await expect(provider.isAvailable()).resolves.toBe(true);
}

export async function staysHidden(contractCase: ProviderContractCase): Promise<void> {
  await system.load({ platform: contractCase.system.platform });
  await expect(contractCase.create().isAvailable()).resolves.toBe(false);
}

export async function listsExpectedRows(contractCase: ProviderContractCase): Promise<void> {
  const rows = await nominalRows(contractCase);
  if (isGoldenRef(contractCase.outdated)) {
    await expect(goldenText(rows)).toMatchFileSnapshot(contractCase.outdated.file);
    return;
  }
  expect(rows).toEqual(contractCase.outdated);
}

/** row-*, row-unique-ids and slow-flag over the nominal scan. */
async function scanViolations(contractCase: ProviderContractCase): Promise<Violation[]> {
  const provider = await providerOn(contractCase);
  const rows = await provider.listOutdated();
  const requestCount = system.trace.requests.length;
  return [...rowViolations(rows), ...slowFlagViolations(provider, rows, requestCount)];
}

export async function satisfiesRowInvariants(contractCase: ProviderContractCase): Promise<void> {
  expectNone(await scanViolations(contractCase), contractCase);
}

export async function survivesScanFaults(contractCase: ProviderContractCase): Promise<void> {
  expectNoFindings(await sweepScan(contractCase), contractCase.create().id);
}

interface UpdateRun {
  readonly outcome: UpdateOutcome;
  readonly violations: readonly Violation[];
}

/** One `update()` with every install exiting 0: its outcome and its invariant violations. */
async function nominalUpdate(
  contractCase: ProviderContractCase,
  expectation: UpdateExpectation,
): Promise<UpdateRun> {
  const provider = await providerOn(contractCase);
  const outcome = await provider.update(expectation.packageId);
  const installs = installSpawns(system.trace);
  const violations = [
    ...outcomeViolations(outcome, expectation.packageId),
    ...shellViolations(installs),
  ];
  return { outcome, violations };
}

export async function installsDocumentedArgv(
  contractCase: ProviderContractCase,
  expectation: UpdateExpectation,
): Promise<void> {
  const { outcome, violations } = await nominalUpdate(contractCase, expectation);
  expect(installSpawns(system.trace).map((spawn) => spawn.argv)).toEqual(expectation.installs);
  expectNone(violations, contractCase);
  const { packageId } = expectation;
  expect(outcome).toMatchObject({ id: packageId, success: true, ...expectation.outcome });
}

export async function reportsFailedInstall(
  contractCase: ProviderContractCase,
  expectation: UpdateExpectation,
): Promise<void> {
  const provider = await providerOn(contractCase);
  const succeeding = expectation.installs.slice(1).map(() => ({ exitCode: 0 }));
  system.answerInstall(...succeeding, { exitCode: 1 });
  const { packageId } = expectation;
  const outcome = await provider.update(packageId);
  expect(outcome).toMatchObject({ id: packageId, success: false, ...expectation.onFailure });
  expectNoFindings(await sweepInstalls(contractCase), contractCase.create().id);
}

/** The fields of `expected` the outcome does not match, as `field: actual ≠ expected`. */
function outcomeMismatches(outcome: UpdateOutcome, expected: Partial<UpdateOutcome>): string[] {
  return Object.entries(expected)
    .filter(([field, value]) => !isDeepStrictEqual(outcome[field as keyof UpdateOutcome], value))
    .map(([field, value]) => {
      const actual = JSON.stringify(outcome[field as keyof UpdateOutcome]);
      return `${field}: ${actual} ≠ ${JSON.stringify(value)}`;
    });
}

interface RouteRun extends UpdateRun {
  readonly argvs: readonly (readonly string[])[];
}

/** `update(packageId)` on the route's machine: outcome, install argvs, raw violations. */
async function runRoute(
  contractCase: ProviderContractCase,
  packageId: string,
  route: UpdateRoute,
): Promise<RouteRun> {
  await system.load(route.system);
  const outcome = await contractCase.create().update(packageId);
  const installs = installSpawns(system.trace);
  const violations = [...outcomeViolations(outcome, packageId), ...shellViolations(installs)];
  return { outcome, violations, argvs: installs.map((spawn) => spawn.argv) };
}

/** What went wrong when `packageId` is updated on the route's machine. */
async function routeProblems(
  contractCase: ProviderContractCase,
  packageId: string,
  route: UpdateRoute,
): Promise<string[]> {
  const { outcome, violations, argvs } = await runRoute(contractCase, packageId, route);
  const problems = outcomeMismatches(outcome, { id: packageId, success: true, ...route.outcome });
  if (!isDeepStrictEqual(argvs, route.installs)) {
    problems.unshift(`installs ${JSON.stringify(argvs)} ≠ ${JSON.stringify(route.installs)}`);
  }
  problems.push(...unwaived(violations, contractCase.waivers ?? []).map(formatViolation));
  return problems.map((problem) => `via ${route.via}: ${problem}`);
}

/** Raw violations of every route, for the dead-waiver check. */
async function allRouteViolations(contractCase: ProviderContractCase): Promise<Violation[]> {
  const packageId = contractCase.update?.packageId;
  if (packageId === undefined) return [];
  const violations: Violation[] = [];
  for (const route of contractCase.routes ?? []) {
    violations.push(...(await runRoute(contractCase, packageId, route)).violations);
  }
  return violations;
}

export async function routesEveryUpdate(
  contractCase: ProviderContractCase,
  expectation: UpdateExpectation,
): Promise<void> {
  const problems: string[] = [];
  for (const route of contractCase.routes ?? []) {
    problems.push(...(await routeProblems(contractCase, expectation.packageId, route)));
  }
  failOn(problems, `${problems.length} misrouted update problem(s):`);
}

export async function ignoresEmptyUpdateAll(contractCase: ProviderContractCase): Promise<void> {
  const provider = await providerOn(contractCase);
  await expect(provider.updateAll([])).resolves.toEqual([]);
  expect(installSpawns(system.trace)).toEqual([]);
}

interface UpdateAllInput {
  readonly rows: readonly OutdatedPackage[];
  /** True when the case lists no rows and `SYNTHETIC_ROWS` stand in. */
  readonly isSynthetic: boolean;
}

/** The rows `updateAll` is checked with. */
async function updateAllRows(contractCase: ProviderContractCase): Promise<UpdateAllInput> {
  const rows = inlineRows(contractCase) ?? (await nominalRows(contractCase));
  if (rows.length === 0) return { rows: SYNTHETIC_ROWS, isSynthetic: true };
  return { rows, isSynthetic: false };
}

/** updateAll-shape and outcome-id over one `updateAll()` of the nominal rows. */
async function updateAllShapeViolations(
  contractCase: ProviderContractCase,
): Promise<Violation[]> {
  const { rows, isSynthetic } = await updateAllRows(contractCase);
  const provider = await providerOn(contractCase);
  // Synthetic rows reach probes no case scripts: answer them as failures.
  system.explore(isSynthetic);
  const outcomes = await provider.updateAll([...rows]);
  const installs = installSpawns(system.trace).map((spawn) => spawn.argv);
  const observation = {
    rows,
    outcomes,
    installCount: installs.length,
    installsPerPackage: Math.max(1, contractCase.update?.installs.length ?? 1),
  };
  return [
    ...updateAllViolations(contractCase.updateAll, observation),
    ...batchInstallViolations(contractCase.batchInstalls, installs),
    // Ids are the shape's business; here, skipped/retryable must still mean failure.
    ...outcomes.flatMap((outcome) => outcomeViolations(outcome, outcome.id)),
  ];
}

export async function followsUpdateAllShape(contractCase: ProviderContractCase): Promise<void> {
  expectNone(await updateAllShapeViolations(contractCase), contractCase);
}

/**
 * Failed installs queued for a failed updateAll: more than any provider
 * spawns for one batch, fallbacks included, so none of them can succeed.
 */
const FAILED_BATCH_INSTALLS = 64;

/** Every install of an updateAll exits 1: no outcome may claim a success. */
export async function reportsFailedUpdateAll(contractCase: ProviderContractCase): Promise<void> {
  const { rows, isSynthetic } = await updateAllRows(contractCase);
  const provider = await providerOn(contractCase);
  system.explore(isSynthetic);
  const failures = Array.from({ length: FAILED_BATCH_INSTALLS }, () => ({ exitCode: 1 }));
  system.answerInstall(...failures);
  const outcomes = await provider.updateAll([...rows]);
  const succeeded = outcomes.filter((outcome) => outcome.success);
  const problems = succeeded.map((outcome) => `${JSON.stringify(outcome.id)} reported success`);
  failOn(problems, "outcome(s) of a failed updateAll claim a success:");
}

/** Every waiver must cover a violation the nominal scenario really produces. */
export async function needsEveryWaiver(contractCase: ProviderContractCase): Promise<void> {
  const { update } = contractCase;
  const raw = [
    ...(await scanViolations(contractCase)),
    ...(update ? (await nominalUpdate(contractCase, update)).violations : []),
    ...(await allRouteViolations(contractCase)),
    ...(await updateAllShapeViolations(contractCase)),
  ];
  const exercised = new Set(raw.map((violation) => violation.invariant));
  const dead = (contractCase.waivers ?? []).filter((waiver) => !exercised.has(waiver.invariant));
  const problems = dead.map((waiver) => `${waiver.invariant} (${waiver.reason}) is never needed`);
  failOn(problems, "dead waiver(s), remove them:");
}
