#!/usr/bin/env node
// Per-file coverage delta between a baseline run and the current one.
//
// The provider test migration deletes hand-written suites in favour of
// generated contract tests (docs/development/testing.md, rule R2): a
// migration commit may not lower the coverage of any source file of the
// domain it migrates by more than the tolerance. Both inputs are Vitest
// `json-summary` reports (`--coverage.reporter=json-summary`).
//
//   node scripts/coverage-delta.mjs --baseline <coverage-summary.json>
//     [--current coverage/coverage-summary.json] [--scope src/providers/os/]…
//     [--metric branches]… [--tolerance 1]
//
// Exit codes: 0 when no file regressed, 1 when one did, 2 on a usage error
// (missing option, unreadable or malformed report).
import { existsSync, readFileSync } from "node:fs";
import { parseArgs } from "node:util";

const DEFAULT_CURRENT = "coverage/coverage-summary.json";
const DEFAULT_METRICS = ["branches"];
const DEFAULT_TOLERANCE = 1;
const KNOWN_METRICS = new Set(["lines", "statements", "functions", "branches"]);
const USAGE_ERROR = 2;
const REGRESSION = 1;

const USAGE =
  "usage: node scripts/coverage-delta.mjs --baseline <coverage-summary.json> " +
  "[--current <coverage-summary.json>] [--scope <path prefix>]... " +
  "[--metric lines|statements|functions|branches]... [--tolerance <points>]";

/** Reports key files by absolute path; compare them by their `src/...` path. */
function repoPath(key) {
  const path = key.replaceAll("\\", "/");
  const index = path.lastIndexOf("/src/");
  return index === -1 ? path : path.slice(index + 1);
}

function readSummary(file) {
  const raw = JSON.parse(readFileSync(file, "utf8"));
  const entries = Object.entries(raw).filter(([key]) => key !== "total");
  return new Map(entries.map(([key, value]) => [repoPath(key), value]));
}

/** A file without branches reports 100; anything unreadable counts as 0. */
function percent(entry, metric) {
  const value = entry?.[metric]?.pct;
  return typeof value === "number" ? value : 0;
}

function parseOptions(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      baseline: { type: "string" },
      current: { type: "string", default: DEFAULT_CURRENT },
      scope: { type: "string", multiple: true, default: [] },
      metric: { type: "string", multiple: true, default: DEFAULT_METRICS },
      tolerance: { type: "string", default: String(DEFAULT_TOLERANCE) },
    },
  });
  const tolerance = Number(values.tolerance);
  const unknown = values.metric.filter((metric) => !KNOWN_METRICS.has(metric));
  if (!values.baseline || Number.isNaN(tolerance) || tolerance < 0 || unknown.length > 0) {
    throw new Error(USAGE);
  }
  return { ...values, tolerance };
}

function isInScope(path, scopes) {
  return scopes.length === 0 || scopes.some((scope) => path.startsWith(scope));
}

/** One line per baseline file and metric: its status and both percentages. */
function compareFile(path, context) {
  const before = context.baseline.get(path);
  const after = context.current.get(path);
  if (!after) {
    // A deleted source file has nothing left to cover.
    if (!existsSync(path)) return [{ path, status: "removed", detail: "" }];
    return [{ path, status: "FAIL", detail: "absent from the current report" }];
  }
  return context.metric.map((metric) => {
    const delta = percent(after, metric) - percent(before, metric);
    const status = delta < -context.tolerance ? "FAIL" : "ok";
    const detail =
      `${metric} ${percent(before, metric).toFixed(2)} -> ` +
      `${percent(after, metric).toFixed(2)} (${delta >= 0 ? "+" : ""}${delta.toFixed(2)})`;
    return { path, status, detail };
  });
}

function report(context) {
  const paths = [...context.baseline.keys()].filter((path) => isInScope(path, context.scope));
  const rows = paths.sort().flatMap((path) => compareFile(path, context));
  const added = [...context.current.keys()].filter(
    (path) => isInScope(path, context.scope) && !context.baseline.has(path),
  );
  const width = Math.max(0, ...rows.map((row) => row.path.length));
  for (const row of rows) {
    console.log(`${row.status.padEnd(7)} ${row.path.padEnd(width)}  ${row.detail}`);
  }
  for (const path of added) console.log(`new     ${path}`);
  const failures = rows.filter((row) => row.status === "FAIL").length;
  console.log(
    `\n${paths.length} file(s) compared, ${failures} regression(s) beyond ` +
      `${context.tolerance} point(s), ${added.length} new file(s)`,
  );
  return failures;
}

/** Options and both reports, or a usage error explaining what is wrong. */
function loadContext(argv) {
  const options = parseOptions(argv);
  try {
    return {
      ...options,
      baseline: readSummary(options.baseline),
      current: readSummary(options.current),
    };
  } catch (error) {
    throw new Error(`cannot read a coverage summary: ${error.message}`, { cause: error });
  }
}

function main() {
  let context;
  try {
    context = loadContext(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return USAGE_ERROR;
  }
  return report(context) === 0 ? 0 : REGRESSION;
}

process.exitCode = main();
