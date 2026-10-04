import { appendFileSync } from "node:fs";
import type { Reporter, TestModule } from "vitest/node";
import { e2eScope, isMutateEnabled } from "./scope.js";

/**
 * Vitest reporter for end-to-end runs: one table row per suite of the e2e
 * project — result, the notes its tests left with `annotate()` (timings,
 * versions, counts), duration — printed after the run and appended to the
 * GitHub job summary (`$GITHUB_STEP_SUMMARY`) in CI. The other projects'
 * files are left to the default reporter.
 */

export interface SummaryRow {
  readonly suite: string;
  readonly result: string;
  readonly seconds: number;
}

/** What the summary reads of one test (a subset of vitest's `TestCase`). */
export interface ReportedCase {
  readonly name: string;
  result(): { readonly state: string; readonly note?: string | undefined };
  annotations(): ReadonlyArray<{ readonly message: string }>;
}

/** What the summary reads of one test file (a subset of vitest's `TestModule`). */
export interface ReportedModule {
  readonly relativeModuleId: string;
  readonly children: { allTests(): Iterable<ReportedCase> };
  diagnostic(): { readonly duration: number };
}

const E2E_PROJECT = "e2e";
const SUITE_PATH = /(?:^|[\\/])tests[\\/]e2e[\\/](.+)\.e2e\.test\.ts$/;
const NOTE_SEPARATOR = " · ";
const MS_PER_SECOND = 1000;

// summaryRow and renderSummary are exported for the toolkit's self-test.

/** One suite's row: its path under tests/e2e, its result with its tests' notes, its duration. */
export function summaryRow(module: ReportedModule): SummaryRow {
  const tests = [...module.children.allTests()];
  const suite = SUITE_PATH.exec(module.relativeModuleId)?.[1]?.replaceAll("\\", "/");
  return {
    suite: suite ?? module.relativeModuleId,
    result: resultOf(tests),
    seconds: module.diagnostic().duration / MS_PER_SECOND,
  };
}

function resultOf(tests: readonly ReportedCase[]): string {
  const inState = (state: string): ReportedCase[] =>
    tests.filter((test) => test.result().state === state);
  const [failed, passed, skipped] = [inState("failed"), inState("passed"), inState("skipped")];
  const ran = failed.length + passed.length;
  if (failed.length > 0) return `FAIL ${failed.length}/${ran} · ${failed[0]?.name ?? ""}`;
  if (passed.length === 0) return withNotes("SKIP", skipNotes(skipped));
  const skippedNote = skipped.length > 0 ? ` (${skipped.length} skipped)` : "";
  const notes = passed.flatMap((test) => test.annotations().map((note) => note.message));
  return withNotes(`PASS ${ran}/${ran}${skippedNote}`, notes);
}

function skipNotes(skipped: readonly ReportedCase[]): string[] {
  const notes = skipped.map((test) => test.result().note).filter((note) => note !== undefined);
  return [...new Set(notes)];
}

function withNotes(head: string, notes: readonly string[]): string {
  return [head, ...notes].join(NOTE_SEPARATOR);
}

/** The markdown block: a heading, then one row per suite. */
export function renderSummary(heading: string, rows: readonly SummaryRow[]): string {
  const cell = (text: string): string => text.replaceAll("|", "\\|").replaceAll("\n", " ");
  const lines = rows.map(
    (row) => `| ${cell(row.suite)} | ${cell(row.result)} | ${row.seconds.toFixed(1)} s |`,
  );
  return [`### ${heading}`, "", "| suite | result | time |", "|---|---|---|", ...lines].join("\n");
}

function summaryHeading(): string {
  const scope = `${e2eScope()}${isMutateEnabled() ? " + mutate" : ""}`;
  const host = `${process.platform} ${process.arch} · Node ${process.versions.node}`;
  return `gup E2E — ${host} · scope ${scope}`;
}

export default class E2eSummaryReporter implements Reporter {
  onTestRunEnd(testModules: ReadonlyArray<TestModule>): void {
    const rows = testModules
      .filter((module) => module.project.name === E2E_PROJECT)
      .map((module) => summaryRow(module));
    if (rows.length === 0) return;
    const summary = renderSummary(summaryHeading(), rows);
    process.stdout.write(`\n${summary}\n\n`);
    const jobSummary = process.env["GITHUB_STEP_SUMMARY"];
    if (jobSummary) appendFileSync(jobSummary, `${summary}\n\n`, "utf8");
  }
}
