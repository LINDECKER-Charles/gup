import { readFile, readdir } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

const SRC_ROOT = join(process.cwd(), "src");

async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const out: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else if (entry.isFile() && entry.name.endsWith(".ts")) out.push(full);
  }
  return out;
}

/**
 * All upstream version probes must use https. A regression to http would
 * expose users to MITM tampering of "latest version" answers — which we then
 * shove into an install command.
 */
describe("network targets", () => {
  it("no http:// literal in source", async () => {
    const files = await walk(SRC_ROOT);
    const offenders: { file: string; match: string }[] = [];
    for (const file of files) {
      const content = await readFile(file, "utf8");
      const matches = content.match(/"http:\/\/[^"\s]+"|`http:\/\/[^`\s]+`/g);
      if (!matches) continue;
      const rel = relative(process.cwd(), file).split(sep).join("/");
      for (const m of matches) offenders.push({ file: rel, match: m });
    }
    expect(offenders).toEqual([]);
  });
});
