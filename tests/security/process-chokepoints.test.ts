import { readFile, readdir } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Drift detection for the spawn chokepoint. Every child process gup starts
 * goes through `src/core/runner.ts`, where the command name and argv are
 * sanitised and the timeout, skip and tree-kill levers are armed. A second
 * module importing execa would be a second, unguarded way to run a command —
 * install sinks included: they receive an already-sanitised request and
 * start it through the runner's own helpers.
 */
const EXECA_IMPORTERS = new Set(["src/core/runner.ts"]);

async function sourceFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) return sourceFiles(full);
      return Promise.resolve(entry.name.endsWith(".ts") ? [full] : []);
    }),
  );
  return nested.flat();
}

const toPosixRel = (absolute: string): string =>
  relative(process.cwd(), absolute).split(sep).join("/");

describe("process chokepoints", () => {
  it("imports execa from src/core/runner.ts only", async () => {
    const offenders: string[] = [];
    for (const file of await sourceFiles(join(process.cwd(), "src"))) {
      const content = await readFile(file, "utf8");
      if (!/from\s+["']execa["']/.test(content)) continue;
      const rel = toPosixRel(file);
      if (!EXECA_IMPORTERS.has(rel)) offenders.push(rel);
    }
    expect(offenders, "spawn through src/core/runner.ts instead of importing execa").toEqual([]);
  });
});
