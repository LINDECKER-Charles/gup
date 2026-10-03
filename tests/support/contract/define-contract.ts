import { describe, it } from "vitest";
import {
  detectsItself,
  followsUpdateAllShape,
  ignoresEmptyUpdateAll,
  installsDocumentedArgv,
  listsExpectedRows,
  needsEveryWaiver,
  reportsFailedInstall,
  reportsFailedUpdateAll,
  routesEveryUpdate,
  satisfiesRowInvariants,
  staysHidden,
  survivesScanFaults,
} from "./checks.js";
import { caseLabel } from "./scenario.js";
import type { ContractSuite, ProviderContractCase } from "./types.js";

/**
 * Generate the contract tests of a provider domain:
 *
 *   tests/providers/<domain>/contract.test.ts
 *   defineProviderContract({ domain: "iac", cases: [...iacCases, ...hashicorpCases] });
 *
 * Per case: detection on its machine and on a clean one, the exact rows (or a
 * golden), the row invariants, a fault sweep of the scan, the install argv and
 * its failure handling when `update` is declared, the same update on every
 * declared route, and the `updateAll` shape (with its batch argv when pinned)
 * and failure handling.
 * Every test loads its own machine; nothing is shared between them.
 */
export function defineProviderContract(suite: ContractSuite): void {
  const labels = suite.cases.map(caseLabel);
  assertValidSuite(suite, labels);
  describe(`${suite.domain} contract`, () => {
    suite.cases.forEach((contractCase, index) => {
      describe(labels[index] ?? "", () => defineCase(contractCase));
    });
  });
}

/** Mistakes in the suite itself fail at collection, before any test runs. */
function assertValidSuite(suite: ContractSuite, labels: readonly string[]): void {
  const duplicate = labels.find((label, index) => labels.indexOf(label) !== index);
  if (duplicate) throw new Error(`${suite.domain}: two cases are labelled "${duplicate}"`);
  const unrouted = suite.cases.findIndex((entry) => entry.routes && !entry.update);
  if (unrouted !== -1) {
    throw new Error(`${suite.domain}: "${labels[unrouted]}" declares routes but no update`);
  }
  const waivers = suite.cases.flatMap((contractCase) => contractCase.waivers ?? []);
  const undocumented = waivers.find((waiver) => waiver.reason.trim() === "");
  if (undocumented) {
    throw new Error(`${suite.domain}: the waiver of "${undocumented.invariant}" has no reason`);
  }
}

function defineCase(contractCase: ProviderContractCase): void {
  it("detects itself on a machine that has it", () => detectsItself(contractCase));
  it("stays hidden on a clean machine", () => staysHidden(contractCase));
  it("lists exactly the expected rows", () => listsExpectedRows(contractCase));
  it("returns rows that satisfy the row invariants", () => satisfiesRowInvariants(contractCase));
  it("survives every injected fault", () => survivesScanFaults(contractCase));
  defineUpdateTests(contractCase);
  it("does nothing for an empty updateAll", () => ignoresEmptyUpdateAll(contractCase));
  it(`updateAll follows the ${contractCase.updateAll} shape`, () =>
    followsUpdateAllShape(contractCase));
  if (contractCase.updateAll !== "skipped") {
    it("reports a failed updateAll as failed outcomes", () =>
      reportsFailedUpdateAll(contractCase));
  }
  if ((contractCase.waivers ?? []).length > 0) {
    it("needs every declared waiver", () => needsEveryWaiver(contractCase));
  }
}

function defineUpdateTests(contractCase: ProviderContractCase): void {
  const expectation = contractCase.update;
  if (!expectation) return;
  it("installs through the documented argv", () =>
    installsDocumentedArgv(contractCase, expectation));
  if ((contractCase.routes ?? []).length > 0) {
    it("routes the update to the installer that owns the binary", () =>
      routesEveryUpdate(contractCase, expectation));
  }
  if (expectation.installs.length === 0) return;
  it("reports a failed install as an outcome", () =>
    reportsFailedInstall(contractCase, expectation));
}
