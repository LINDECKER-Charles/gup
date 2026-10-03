import { isDeepStrictEqual } from "node:util";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../../src/core/types.js";
import type { SpawnRecord } from "../system/types.js";
import type { InvariantId, UpdateAllShape, Violation, Waiver } from "./types.js";

/**
 * The rules every provider obeys, as pure checks returning violations. They
 * encode CONTRIBUTING's provider rules and the "only emit truly outdated
 * packages" rule of how-gup-works.md.
 */

/** Synthetic version providers emit when the real one is unknowable (editor plugins, helm…). */
export const UNKNOWN_VERSION = "?";
/** Synthetic `latest` of providers that can only offer "refresh everything" (cygwin, nix…). */
export const REFRESH_MARKER = "refresh";
/** The one binary allowed a shell-routed install: scoop's shim (shell-usage allowlist). */
const SHELL_ALLOWED_COMMAND = "scoop";

function makeViolation(invariant: InvariantId, detail: string): Violation {
  return { invariant, detail };
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function describeRow(row: OutdatedPackage, index: number): string {
  return `row ${index} (${JSON.stringify(row.id)})`;
}

function rowShapeProblem(row: OutdatedPackage): string | null {
  if (!isNonEmptyString(row.id) || row.id !== row.id.trim()) {
    return "id is not a trimmed, non-empty string";
  }
  if (!isNonEmptyString(row.current)) return `current is ${JSON.stringify(row.current)}`;
  if (!isNonEmptyString(row.latest)) return `latest is ${JSON.stringify(row.latest)}`;
  if (row.name !== undefined && !isNonEmptyString(row.name)) return "name is present but empty";
  if (row.note !== undefined && !isNonEmptyString(row.note)) return "note is present but empty";
  return null;
}

function isSyntheticPair(row: OutdatedPackage): boolean {
  const markers = [row.current, row.latest];
  return markers.includes(UNKNOWN_VERSION) || row.latest === REFRESH_MARKER;
}

function rowProblems(
  row: OutdatedPackage,
  index: number,
  seen: ReadonlySet<string>,
): Violation[] {
  const subject = describeRow(row, index);
  const problems: Violation[] = [];
  const shape = rowShapeProblem(row);
  if (shape) problems.push(makeViolation("row-shape", `${subject}: ${shape}`));
  if (row.current === row.latest && !isSyntheticPair(row)) {
    const detail = `${subject}: current equals latest (${JSON.stringify(row.latest)})`;
    problems.push(makeViolation("row-current-differs", detail));
  }
  if (seen.has(row.id)) {
    problems.push(makeViolation("row-unique-ids", `${subject}: duplicate id`));
  }
  return problems;
}

/** row-shape, row-current-differs and row-unique-ids over one `listOutdated()` result. */
export function rowViolations(rows: readonly OutdatedPackage[]): Violation[] {
  const seen = new Set<string>();
  return rows.flatMap((row, index) => {
    const problems = rowProblems(row, index, seen);
    seen.add(row.id);
    return problems;
  });
}

/** outcome-id: the outcome names its package, and skipped/retryable imply a failure. */
export function outcomeViolations(outcome: UpdateOutcome, packageId: string): Violation[] {
  const subject = `outcome for ${JSON.stringify(packageId)}`;
  const problems: string[] = [];
  if (outcome.id !== packageId) problems.push(`has id ${JSON.stringify(outcome.id)}`);
  if (outcome.skipped === true && outcome.success) problems.push("is both skipped and successful");
  if (outcome.retryable === true && outcome.success) {
    problems.push("is both retryable and successful");
  }
  return problems.map((problem) => makeViolation("outcome-id", `${subject} ${problem}`));
}

/** update-no-shell: only scoop's shim may be spawned through a shell. */
export function shellViolations(installs: readonly SpawnRecord[]): Violation[] {
  return installs
    .filter((spawn) => spawn.shell && spawn.argv[0] !== SHELL_ALLOWED_COMMAND)
    .map((spawn) => {
      const detail = `${JSON.stringify(spawn.argv)} is spawned through a shell`;
      return makeViolation("update-no-shell", detail);
    });
}

/**
 * slow-flag: a scan that issues one HTTP request (or more) per row, over two
 * rows or more, is what `--fast` exists to skip; the provider must say so.
 */
export function slowFlagViolations(
  provider: Provider,
  rows: readonly OutdatedPackage[],
  requestCount: number,
): Violation[] {
  const isPerRowFetcher = rows.length >= 2 && requestCount >= rows.length;
  if (!isPerRowFetcher || provider.slow === true) return [];
  const detail = `${requestCount} request(s) for ${rows.length} rows, but \`slow\` is not set`;
  return [makeViolation("slow-flag", detail)];
}

export interface UpdateAllObservation {
  readonly rows: readonly OutdatedPackage[];
  readonly outcomes: readonly UpdateOutcome[];
  readonly installCount: number;
  /** Installs one `update()` performs (from the case's `update.installs`, 1 by default). */
  readonly installsPerPackage: number;
}

interface ExpectedShape {
  readonly installs: number;
  /** Outcome ids in order, or null when the shape does not tie outcomes to rows. */
  readonly outcomeIds: readonly string[] | null;
}

function expectedShape(shape: UpdateAllShape, observation: UpdateAllObservation): ExpectedShape {
  const ids = observation.rows.map((row) => row.id);
  switch (shape) {
    case "per-package":
      return { installs: ids.length * observation.installsPerPackage, outcomeIds: ids };
    case "one-batch":
      return { installs: 1, outcomeIds: ids };
    case "collapsed":
      return { installs: 1, outcomeIds: null };
    case "skipped":
      return { installs: 0, outcomeIds: ids };
  }
}

function shapeProblems(shape: UpdateAllShape, observation: UpdateAllObservation): string[] {
  const expected = expectedShape(shape, observation);
  const { installCount, outcomes } = observation;
  const actualIds = JSON.stringify(outcomes.map((outcome) => outcome.id));
  const expectedIds = JSON.stringify(expected.outcomeIds);
  const problems: string[] = [];
  if (installCount !== expected.installs) {
    problems.push(`${installCount} install(s), expected ${expected.installs}`);
  }
  if (expected.outcomeIds && actualIds !== expectedIds) {
    problems.push(`outcomes ${actualIds}, expected ${expectedIds}`);
  }
  if (shape === "collapsed" && outcomes.length !== 1) {
    problems.push(`${outcomes.length} outcome(s), expected 1`);
  }
  if (shape === "skipped" && outcomes.some((outcome) => outcome.skipped !== true)) {
    problems.push("an outcome is not skipped");
  }
  return problems;
}

/** updateAll-shape: install count and outcome ids match the declared shape. */
export function updateAllViolations(
  shape: UpdateAllShape,
  observation: UpdateAllObservation,
): Violation[] {
  return shapeProblems(shape, observation).map((problem) =>
    makeViolation("updateAll-shape", `${shape}: ${problem}`),
  );
}

/** updateAll-shape: the batch spawned exactly the installs the case pins, when it pins any. */
export function batchInstallViolations(
  expected: readonly (readonly string[])[] | undefined,
  actual: readonly (readonly string[])[],
): Violation[] {
  if (expected === undefined || isDeepStrictEqual(actual, expected)) return [];
  const detail = `installs ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`;
  return [makeViolation("updateAll-shape", detail)];
}

/** The violations no waiver covers. */
export function unwaived(
  violations: readonly Violation[],
  waivers: readonly Waiver[],
): Violation[] {
  const waived = new Set(waivers.map((waiver) => waiver.invariant));
  return violations.filter((candidate) => !waived.has(candidate.invariant));
}

export function formatViolation(violation: Violation): string {
  return `${violation.invariant}: ${violation.detail}`;
}
