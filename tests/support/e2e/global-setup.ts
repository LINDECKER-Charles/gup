import { existsSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { CLI_ENTRY, PROGRAM_ENTRY, REPO_ROOT, TRAMPOLINE_ENTRY } from "./cli.js";
import { detectTerminal } from "./pty-session.js";

/**
 * Global setup of the e2e project. The suites run the built CLI, so a
 * missing or stale `dist/` would test yesterday's code: refuse it. Then say
 * once whether the embedded terminal loads here — on macOS the detection also
 * restores `spawn-helper`'s exec bit (amendment IT-2), as gup does at start.
 */

const BUILD_HINT = "run `npm run build` first (npm run test:e2e does)";

/** Why `dist/` cannot be tested, or null. */
function buildProblem(): string | null {
  const entries = [CLI_ENTRY, PROGRAM_ENTRY, TRAMPOLINE_ENTRY];
  for (const entry of entries) {
    if (!existsSync(entry)) return `${relative(REPO_ROOT, entry)} is missing: ${BUILD_HINT}`;
  }
  const builtAt = Math.min(...entries.map((entry) => statSync(entry).mtimeMs));
  const newer = newestSource(join(REPO_ROOT, "src"));
  if (newer && newer.mtimeMs > builtAt) {
    return `dist/ is older than ${relative(REPO_ROOT, newer.path)}: ${BUILD_HINT}`;
  }
  return null;
}

function newestSource(dir: string): { readonly path: string; readonly mtimeMs: number } | null {
  let newest: { path: string; mtimeMs: number } | null = null;
  for (const name of readdirSync(dir, { recursive: true, encoding: "utf8" })) {
    const path = join(dir, name);
    const { mtimeMs } = statSync(path);
    if (!newest || mtimeMs > newest.mtimeMs) newest = { path, mtimeMs };
  }
  return newest;
}

export default async function setup(): Promise<void> {
  const problem = buildProblem();
  if (problem) throw new Error(problem);
  const terminal = await detectTerminal();
  const state = terminal.isAvailable ? "available" : `unavailable (${terminal.reason})`;
  console.log(`gup e2e: embedded terminal ${state} on ${process.platform}`);
}
