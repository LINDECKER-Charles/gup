import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

/**
 * What a suite leaves behind to read a failure it cannot reproduce here (a
 * CI runner's screen, a real scan's JSON): written under the directory
 * `GUP_E2E_ARTIFACTS` names — the E2E workflow sets it and uploads it. Unset
 * (a local run), nothing is written: a screen of a developer's machine shows
 * their own packages.
 */
export async function saveArtifact(name: string, content: string): Promise<void> {
  const root = process.env["GUP_E2E_ARTIFACTS"];
  if (!root) return;
  const file = join(root, safeName(name));
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, content, "utf8");
}

/** A test title as a path: separators kept, characters a file system refuses replaced. */
function safeName(name: string): string {
  return name.replace(/[<>:"\\|?*\x00-\x1f]/g, "_");
}
