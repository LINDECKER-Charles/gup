import { readFile, readdir } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Drift detection for direct console output from the core and the providers.
 * Those layers also run while gup owns the screen (an update inside the
 * full-screen app) or with no terminal at all (a scheduled run): a write
 * straight to stdout/stderr would paint over the frame or vanish. They print
 * through `installConsole` (src/core/process/output-router.ts), which routes
 * each line to the install pane, defers it, or writes it, whichever applies.
 *
 * Only the two modules that ARE the output path may write: the runner (it
 * owns the terminal it hands to installers) and the router itself.
 */
const ALLOWED_WRITERS = new Set(["src/core/runner.ts", "src/core/process/output-router.ts"]);
const SCANNED_TREES = ["src/core", "src/providers"];
const DIRECT_OUTPUT = /process\.(?:stdout|stderr)\.write\s*\(|\bconsole\.[a-z]+\s*\(/;

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

describe("core and provider output", () => {
  it.each(SCANNED_TREES)("%s never writes to the console directly", async (tree) => {
    const offenders: string[] = [];
    for (const file of await sourceFiles(join(process.cwd(), tree))) {
      const rel = toPosixRel(file);
      if (ALLOWED_WRITERS.has(rel)) continue;
      if (DIRECT_OUTPUT.test(await readFile(file, "utf8"))) offenders.push(rel);
    }
    expect(offenders, "print through installConsole (core/process/output-router.ts)").toEqual([]);
  });
});
