import { readdir } from "node:fs/promises";
import { join } from "node:path";

const SVG_EXTENSION = ".svg";

/** Paths of the SVGs in `dir` that no scene id produces, sorted; none when `dir` does not exist. */
export async function findOrphans(dir: string, ids: readonly string[]): Promise<string[]> {
  const produced = new Set(ids.map((id) => `${id}${SVG_EXTENSION}`));
  const names = await readdir(dir).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  return names
    .filter((name) => name.endsWith(SVG_EXTENSION) && !produced.has(name))
    .sort()
    .map((name) => join(dir, name));
}
