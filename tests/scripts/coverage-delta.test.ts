import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * scripts/coverage-delta.mjs guards the provider test migration (rule R2): a
 * source file of the migrated domain may not lose more than the tolerance.
 */

const SCRIPT = fileURLToPath(new URL("../../scripts/coverage-delta.mjs", import.meta.url));
const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const execFileAsync = promisify(execFile);

interface Metrics {
  readonly branches: number;
  readonly lines: number;
}

type Summary = Readonly<Record<string, Metrics>>;

/** A json-summary report keyed by absolute paths, as Vitest writes it. */
function report(root: string, files: Summary): string {
  const entries = Object.entries(files).map(([path, metrics]) => [
    join(root, ...path.split("/")),
    {
      branches: { total: 10, covered: metrics.branches / 10, skipped: 0, pct: metrics.branches },
      lines: { total: 10, covered: metrics.lines / 10, skipped: 0, pct: metrics.lines },
    },
  ]);
  return JSON.stringify({ total: {}, ...Object.fromEntries(entries) });
}

interface Run {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "gup-coverage-delta-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function compare(before: Summary, after: Summary, args: readonly string[]): Promise<Run> {
  const baseline = join(dir, "baseline.json");
  const current = join(dir, "current.json");
  // Different roots, as two worktrees would produce.
  await writeFile(baseline, report("F:\\wt\\base", before));
  await writeFile(current, report("/home/u/wt/head", after));
  const argv = [SCRIPT, "--baseline", baseline, "--current", current, ...args];
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, argv, { cwd: REPO_ROOT });
    return { code: 0, stdout, stderr };
  } catch (error) {
    const failure = error as Run;
    return { code: failure.code, stdout: failure.stdout, stderr: failure.stderr };
  }
}

const OS_FILE = "src/providers/os/winget.ts";
const IAC_FILE = "src/providers/iac/opentofu.ts";

describe("coverage-delta", () => {
  it("accepts a drop within the tolerance and matches files across checkouts", async () => {
    const run = await compare(
      { [OS_FILE]: { branches: 93.15, lines: 100 } },
      { [OS_FILE]: { branches: 92.5, lines: 100 } },
      [],
    );

    expect(run.code).toBe(0);
    expect(run.stdout).toContain(`ok      ${OS_FILE}  branches 93.15 -> 92.50 (-0.65)`);
    expect(run.stdout).toContain("1 file(s) compared, 0 regression(s) beyond 1 point(s)");
  });

  it("fails on a drop beyond the tolerance, in each requested metric", async () => {
    const run = await compare(
      { [OS_FILE]: { branches: 93.15, lines: 100 } },
      { [OS_FILE]: { branches: 90, lines: 97 } },
      ["--metric", "branches", "--metric", "lines", "--tolerance", "2"],
    );

    expect(run.code).toBe(1);
    expect(run.stdout).toContain(`FAIL    ${OS_FILE}  branches 93.15 -> 90.00 (-3.15)`);
    expect(run.stdout).toContain(`FAIL    ${OS_FILE}  lines 100.00 -> 97.00 (-3.00)`);
  });

  it("only compares the files of the requested scopes", async () => {
    const run = await compare(
      { [OS_FILE]: { branches: 100, lines: 100 }, [IAC_FILE]: { branches: 100, lines: 100 } },
      { [OS_FILE]: { branches: 100, lines: 100 }, [IAC_FILE]: { branches: 0, lines: 0 } },
      ["--scope", "src/providers/os/"],
    );

    expect(run.code).toBe(0);
    expect(run.stdout).not.toContain(IAC_FILE);
  });

  it("fails on a source file that left the report, not on a deleted one", async () => {
    const run = await compare(
      { [OS_FILE]: { branches: 100, lines: 100 }, "src/gone.ts": { branches: 100, lines: 100 } },
      { "src/new.ts": { branches: 50, lines: 50 } },
      [],
    );

    expect(run.code).toBe(1);
    expect(run.stdout).toContain(`FAIL    ${OS_FILE}  absent from the current report`);
    expect(run.stdout).toContain("removed src/gone.ts");
    expect(run.stdout).toContain("new     src/new.ts");
  });

  it("refuses to run without a baseline", async () => {
    const run = await compare({}, {}, ["--baseline", ""]);

    expect(run.code).toBe(2);
  });

  it("reports an unreadable report as a usage error, not a crash", async () => {
    const run = await compare({}, {}, ["--current", join(dir, "missing.json")]);

    expect(run.code).toBe(2);
    expect(run.stderr).toMatch(/^cannot read a coverage summary: ENOENT/);
  });
});
