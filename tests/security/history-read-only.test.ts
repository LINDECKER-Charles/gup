import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The activity history is written by the update and scan paths and read back
 * for display and export only: the journal view, `gup report`, the
 * diagnostic archive. Its reader and the insights built on it must never
 * feed a decision — which package to update, whether a schedule is due, what
 * a retry does. A module outside the front-ends importing them would be the
 * first step towards that, so the import graph is pinned here.
 */
const READ_SIDE_MODULE = /["'][^"']*(?:\/(?:reader|parse-event)|insights\/[\w-]+)\.js["']/;

/** Path prefixes allowed to import the read side (posix, relative to the repo root). */
const FRONT_ENDS = [
  "src/core/history/reader.ts",
  "src/core/insights/",
  "src/core/export/",
  "src/commands/journal/",
  "src/ui/charts/",
  "src/ui/panels/journal/",
  "src/ui/text/activity-labels.ts",
  "src/ui/views/journal-view.ts",
];

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

async function readSideImporters(): Promise<string[]> {
  const importers: string[] = [];
  for (const file of await sourceFiles(join(process.cwd(), "src"))) {
    if (READ_SIDE_MODULE.test(await readFile(file, "utf8"))) importers.push(toPosixRel(file));
  }
  return importers;
}

describe("history read side", () => {
  it("is imported by the journal, report and export front-ends only", async () => {
    const importers = await readSideImporters();
    const offenders = importers.filter((file) => !FRONT_ENDS.some((prefix) => file.startsWith(prefix)));

    expect(importers.length, "the guard must see the real importers").toBeGreaterThan(0);
    expect(offenders, "the history reader and insights never feed a decision").toEqual([]);
  });
});
