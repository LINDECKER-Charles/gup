import { homedir, tmpdir } from "node:os";

/** Where the renderer's own paths live: its home (and user name), temp dir and checkout. */
function renderingMachinePaths(): string[] {
  return [homedir(), tmpdir(), process.cwd()];
}

/** Separators and case vary by OS and by how a view prints a path: compare without them. */
function comparable(text: string): string {
  return text.replace(/\\/g, "/").toLowerCase();
}

/**
 * The paths of `paths` — by default the machine rendering the screenshots:
 * its home directory, its temp directory (the sandbox lives there), its
 * checkout — that `text` shows. A screenshot must show none: they carry
 * the developer's user name and folders. A path a view wraps over two rows
 * escapes this check; the fixtures and the sandbox are the first line of
 * defence, this is the last.
 */
export function machinePathsIn(
  text: string,
  paths: readonly string[] = renderingMachinePaths(),
): string[] {
  const shown = comparable(text);
  return paths.filter((path) => path !== "" && shown.includes(comparable(path)));
}
