import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The `test (node 26 / <os>)` legs of ci.yml are the required checks of the
 * main ruleset: renaming them blocks every pull request, and so does a step
 * that fails for the runner's reasons rather than the code's. The suites that
 * change the real system (GUP_MUTATE: a Task Scheduler round trip, a killed
 * `npm install -g`) depend on what the hosted image allows, so they run in a
 * job of their own, outside the required names.
 */

const CI = readFileSync(join(process.cwd(), ".github", "workflows", "ci.yml"), "utf8");
const JOB_KEY = /^ {2}([\w-]+):\s*$/;

/** Each job's lines, comments dropped, by job id. */
function jobs(): ReadonlyMap<string, string> {
  const lines = CI.split(/\r?\n/);
  const blocks = new Map<string, string[]>();
  let current: string[] | null = null;
  for (const line of lines.slice(lines.indexOf("jobs:") + 1)) {
    const key = JOB_KEY.exec(line)?.[1];
    if (key !== undefined) blocks.set(key, (current = []));
    else if (current !== null && !line.trim().startsWith("#")) current.push(line);
  }
  return new Map([...blocks].map(([id, block]) => [id, block.join("\n")]));
}

const nameOf = (block: string) => /^ {4}name:\s*(.+)$/m.exec(block)?.[1] ?? "";

describe("ci.yml required checks", () => {
  it("keeps the required job's name and matrix", () => {
    const test = jobs().get("test") ?? "";

    expect(nameOf(test)).toBe("test (node ${{ matrix.node }} / ${{ matrix.os }})");
    expect(test).toContain("os: [windows-latest, macos-latest, ubuntu-latest]");
    expect(test).toContain('node: ["26"]');
  });

  it("runs no mutating suite on a required leg", () => {
    expect(jobs().get("test")).not.toContain("GUP_MUTATE");
  });

  it("runs the mutating suites in a job whose name is not a required check", () => {
    const mutating = [...jobs().values()].filter((block) => /GUP_MUTATE:\s*"1"/.test(block));

    expect(mutating.length).toBeGreaterThan(0);
    for (const block of mutating) expect(nameOf(block)).not.toMatch(/^test \(/);
  });
});
