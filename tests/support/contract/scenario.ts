import type { OutdatedPackage, Provider } from "../../../src/core/types.js";
import { isGoldenRef } from "../fixtures/refs.js";
import { system } from "../system/fake-system.js";
import type { SpawnRecord, Trace } from "../system/types.js";
import type { ProviderContractCase } from "./types.js";

/** Steps the generated tests and the fault sweep share. */

/** Rows `updateAll` is fed when the nominal scenario lists none. */
export const SYNTHETIC_ROWS: readonly OutdatedPackage[] = [
  { id: "contract-row-a", current: "1.0.0", latest: "2.0.0" },
  { id: "contract-row-b", current: "1.0.0", latest: "2.0.0" },
];

/** Load the case's machine, then build the provider (its install hint reads the platform). */
export async function providerOn(contractCase: ProviderContractCase): Promise<Provider> {
  await system.load(contractCase.system);
  return contractCase.create();
}

/** `listOutdated()` on the case's machine, in strict mode. */
export async function nominalRows(contractCase: ProviderContractCase): Promise<OutdatedPackage[]> {
  return (await providerOn(contractCase)).listOutdated();
}

/** The rows a case expects, when they are inline rather than a golden. */
export function inlineRows(contractCase: ProviderContractCase): readonly OutdatedPackage[] | null {
  return isGoldenRef(contractCase.outdated) ? null : contractCase.outdated;
}

/** The text a golden holds: pretty JSON, one trailing newline. */
export function goldenText(rows: readonly OutdatedPackage[]): string {
  return `${JSON.stringify(rows, null, 2)}\n`;
}

export function installSpawns(trace: Trace): readonly SpawnRecord[] {
  return trace.spawns.filter((spawn) => spawn.mode === "inherit");
}

/** An immutable copy: the live trace is emptied by the next `system.load`. */
export function snapshotTrace(trace: Trace): Trace {
  return { spawns: [...trace.spawns], requests: [...trace.requests], fsReads: [...trace.fsReads] };
}

export function caseLabel(contractCase: ProviderContractCase): string {
  const { id } = contractCase.create();
  return contractCase.scenario ? `${id} · ${contractCase.scenario}` : id;
}
