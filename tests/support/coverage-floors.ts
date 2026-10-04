/**
 * Coverage floors (testing spec S14). There is no global threshold: coverage
 * is a flashlight, not a target. The modules where an untested branch can do
 * harm — spawn the wrong command, escalate, lose or leak data, break an
 * escape — may not fall below what they measured. Ratchet only: raising a
 * floor is routine, lowering one needs its reason in the commit body.
 *
 * Measured 2026-10-04 on Windows 11 with Node 26.10, over the unit, providers
 * and integration projects (in brackets: branches / lines). Each floor sits a
 * few points under its measure: some branches only run on another OS (CI
 * computes coverage on Linux), and a floor must hold on every leg.
 * A glob's floor applies to its files together.
 */

export interface CoverageFloor {
  readonly branches: number;
  readonly lines: number;
}

export const COVERAGE_FLOORS: Readonly<Record<string, CoverageFloor>> = {
  // Every process gup starts: the argv barrier, timeouts, the PATH lookup.
  "src/core/runner.ts": { branches: 85, lines: 90 }, // [92.13 / 95.97]
  "src/core/process/**": { branches: 72, lines: 90 }, // [80.95 / 96.47]
  // The argv the embedded terminal's trampoline receives.
  "src/core/pty/trampoline-payload.ts": { branches: 95, lines: 98 }, // [100 / 100]
  // Which package manager gup hands an upgrade to.
  "src/core/install-source.ts": { branches: 95, lines: 98 }, // [98.67 / 100]
  "src/core/ownership.ts": { branches: 92, lines: 95 }, // [97.06 / 100]
  // Privilege: the elevated batch and its child.
  "src/core/elevation.ts": { branches: 80, lines: 92 }, // [87.30 / 97.26]
  "src/commands/admin-batch.ts": { branches: 75, lines: 82 }, // [81.25 / 87.10]
  // What runs, in what order, under which guard and consent.
  "src/core/update/**": { branches: 82, lines: 88 }, // [87.94 / 92.83]
  // The user's settings: atomic writes, corrupt files, concurrent writers.
  "src/core/config/**": { branches: 86, lines: 92 }, // [91.35 / 96.82]
  // Unattended runs: what is due, and the OS triggers that start gup.
  "src/core/scheduler/model/**": { branches: 90, lines: 96 }, // [94.15 / 99.57]
  "src/core/scheduler/trigger/**": { branches: 80, lines: 88 }, // [86.80 / 93.00]
  "src/core/scheduler/artifacts/**": { branches: 90, lines: 97 }, // [95.12 / 100]
  // What reaches a log, an export or a bug report.
  "src/core/log/redact.ts": { branches: 95, lines: 95 }, // [100 / 98.61]
  "src/core/log/sanitize-data.ts": { branches: 90, lines: 95 }, // [95.16 / 98.00]
  "src/core/history/**": { branches: 90, lines: 95 }, // [95.90 / 98.67]
  // The HTML report's escaping and Content-Security-Policy. The missing
  // branches are the unreachable fallbacks of its escape maps.
  "src/report/{csp,embed-json,html-shell}.ts": { branches: 65, lines: 98 }, // [66.67 / 100]
};
