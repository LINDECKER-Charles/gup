import { expect } from "vitest";
import type { OutdatedPackage, UpdateOutcome } from "../../../src/core/types.js";
import { isGoldenRef } from "../fixtures/refs.js";
import { system } from "../system/fake-system.js";
import { formatSweepReport, sweepInstalls, sweepScan, type SweepFinding } from "./fault-sweep.js";
import {
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
import type { ProviderContractCase, UpdateExpectation, Violation } from "./types.js";

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
  const observation = {
    rows,
    outcomes,
    installCount: installSpawns(system.trace).length,
    installsPerPackage: Math.max(1, contractCase.update?.installs.length ?? 1),
  };
  return [
    ...updateAllViolations(contractCase.updateAll, observation),
    // Ids are the shape's business; here, skipped/retryable must still mean failure.
    ...outcomes.flatMap((outcome) => outcomeViolations(outcome, outcome.id)),
  ];
}

export async function followsUpdateAllShape(contractCase: ProviderContractCase): Promise<void> {
  expectNone(await updateAllShapeViolations(contractCase), contractCase);
}

/** Every waiver must cover a violation the nominal scenario really produces. */
export async function needsEveryWaiver(contractCase: ProviderContractCase): Promise<void> {
  const { update } = contractCase;
  const raw = [
    ...(await scanViolations(contractCase)),
    ...(update ? (await nominalUpdate(contractCase, update)).violations : []),
    ...(await updateAllShapeViolations(contractCase)),
  ];
  const exercised = new Set(raw.map((violation) => violation.invariant));
  const dead = (contractCase.waivers ?? []).filter((waiver) => !exercised.has(waiver.invariant));
  const problems = dead.map((waiver) => `${waiver.invariant} (${waiver.reason}) is never needed`);
  failOn(problems, "dead waiver(s), remove them:");
}
