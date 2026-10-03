import type { Provider } from "../../../src/core/types.js";
import { system } from "../system/fake-system.js";
import type {
  Fault,
  FsFaultMode,
  HttpFaultMode,
  SpawnFaultMode,
  Trace,
} from "../system/types.js";
import { formatViolation, outcomeViolations, rowViolations, unwaived } from "./invariants.js";
import { installSpawns, providerOn, snapshotTrace } from "./scenario.js";
import type { ProviderContractCase, Violation } from "./types.js";

/**
 * The fault sweep: re-run a provider against every failure its nominal run
 * touched, and require it to stay fail-soft — resolve, with valid rows (scan)
 * or a failure outcome (update).
 *
 * The sweep injects environmental failures only. `rejects` is not one: the
 * runner spawns with `reject: false`, so it only ever rejects when its argv
 * barrier refuses a call, and a provider may let that refusal propagate (the
 * registry records it as the provider's scan error). It stays available to
 * `system.inject` for tests that pin a specific provider's handling.
 */

const SWEPT_SPAWN_FAULTS: readonly SpawnFaultMode[] = [
  "exit-1",
  "empty",
  "garbage",
  "timeout",
];
const SWEPT_HTTP_FAULTS: readonly HttpFaultMode[] = [
  "status-500",
  "rate-limited",
  "network",
  "abort",
  "bad-json",
];
const SWEPT_FS_FAULTS: readonly FsFaultMode[] = ["missing", "eacces"];
const SWEPT_INSTALL_FAULTS: readonly SpawnFaultMode[] = ["exit-1", "timeout"];

export interface SweepFinding {
  readonly fault: Fault;
  readonly observed: string;
}

function distinct<T>(values: readonly T[], key: (value: T) => string): T[] {
  const seen = new Map<string, T>();
  for (const value of values) if (!seen.has(key(value))) seen.set(key(value), value);
  return [...seen.values()];
}

function distinctArgvs(argvs: readonly (readonly string[])[]): (readonly string[])[] {
  return distinct(argvs, (argv) => JSON.stringify(argv));
}

/** Every fault a scan's trace makes reachable: each spawn, URL and path × each mode. */
export function deriveScanFaults(trace: Trace): Fault[] {
  const probes = distinctArgvs(
    trace.spawns.filter((spawn) => spawn.mode === "run").map((spawn) => spawn.argv),
  );
  const urls = distinct(
    trace.requests.map((request) => request.url),
    (url) => url,
  );
  const paths = distinct(trace.fsReads, (path) => path);
  const spawnFaults = probes.flatMap((argv) =>
    SWEPT_SPAWN_FAULTS.map((mode): Fault => ({ on: "spawn", argv, mode })),
  );
  const httpFaults = urls.flatMap((url) =>
    SWEPT_HTTP_FAULTS.map((mode): Fault => ({ on: "http", url, mode })),
  );
  const fsFaults = paths.flatMap((path) =>
    SWEPT_FS_FAULTS.map((mode): Fault => ({ on: "fs", path, mode })),
  );
  return [...spawnFaults, ...httpFaults, ...fsFaults];
}

function describeError(error: unknown): string {
  if (error instanceof Error) return `threw ${error.name}: ${error.message}`;
  return `threw ${String(error)}`;
}

function describeViolations(violations: readonly Violation[]): string {
  return violations.map(formatViolation).join("; ");
}

/** Load the case in explore mode with one fault injected, and build the provider. */
async function faultedProvider(
  contractCase: ProviderContractCase,
  fault: Fault,
): Promise<Provider> {
  const provider = await providerOn(contractCase);
  system.explore(true);
  system.inject(fault);
  return provider;
}

async function scanUnder(
  contractCase: ProviderContractCase,
  fault: Fault,
): Promise<SweepFinding | null> {
  const provider = await faultedProvider(contractCase, fault);
  try {
    const rows = await provider.listOutdated();
    const broken = unwaived(rowViolations(rows), contractCase.waivers ?? []);
    return broken.length === 0 ? null : { fault, observed: describeViolations(broken) };
  } catch (error) {
    return { fault, observed: describeError(error) };
  }
}

/** Sweep `listOutdated()`: one finding per fault that broke fail-soft. */
export async function sweepScan(
  contractCase: ProviderContractCase,
): Promise<readonly SweepFinding[]> {
  await (await providerOn(contractCase)).listOutdated();
  const faults = deriveScanFaults(snapshotTrace(system.trace));
  const findings: SweepFinding[] = [];
  for (const fault of faults) {
    const finding = await scanUnder(contractCase, fault);
    if (finding) findings.push(finding);
  }
  return findings;
}

async function updateUnder(
  contractCase: ProviderContractCase,
  packageId: string,
  fault: Fault,
): Promise<SweepFinding | null> {
  const provider = await faultedProvider(contractCase, fault);
  try {
    const outcome = await provider.update(packageId);
    const broken = unwaived(outcomeViolations(outcome, packageId), contractCase.waivers ?? []);
    const isFailure = !outcome.success || outcome.skipped === true;
    if (isFailure && broken.length === 0) return null;
    return { fault, observed: isFailure ? describeViolations(broken) : "reported success" };
  } catch (error) {
    return { fault, observed: describeError(error) };
  }
}

/** Sweep `update()`: every install × each install fault must end in a failure outcome. */
export async function sweepInstalls(
  contractCase: ProviderContractCase,
): Promise<readonly SweepFinding[]> {
  const expectation = contractCase.update;
  if (!expectation) return [];
  await (await providerOn(contractCase)).update(expectation.packageId);
  const installs = distinctArgvs(installSpawns(system.trace).map((spawn) => spawn.argv));
  const faults = installs.flatMap((argv) =>
    SWEPT_INSTALL_FAULTS.map((mode): Fault => ({ on: "spawn", argv, mode })),
  );
  const findings: SweepFinding[] = [];
  for (const fault of faults) {
    const finding = await updateUnder(contractCase, expectation.packageId, fault);
    if (finding) findings.push(finding);
  }
  return findings;
}

function describeFault(fault: Fault): string {
  switch (fault.on) {
    case "spawn":
      return `spawn  ${JSON.stringify(fault.argv)} → ${fault.mode}`;
    case "http":
      return `http   ${fault.url} → ${fault.mode}`;
    case "fs":
      return `fs     ${fault.path} → ${fault.mode}`;
  }
}

/** The assertion message: which faults broke the contract, and how to replay one. */
export function formatSweepReport(providerId: string, findings: readonly SweepFinding[]): string {
  const faults = findings.map((finding) => describeFault(finding.fault));
  const width = Math.max("fault".length, ...faults.map((fault) => fault.length));
  const table = findings.map(
    (finding, index) => `  ${(faults[index] ?? "").padEnd(width)}  ${finding.observed}`,
  );
  const first = findings[0];
  const replay = first
    ? `await system.load(case.system); system.inject(${JSON.stringify(first.fault)})`
    : "";
  return [
    `${findings.length} injected fault(s) broke the fail-soft contract of "${providerId}"`,
    "",
    `  ${"fault".padEnd(width)}  observed`,
    ...table,
    ...(first ? ["", `  reproduce:  ${replay}`] : []),
  ].join("\n");
}
