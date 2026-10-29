import { access } from "node:fs/promises";
import { posix, win32 } from "node:path";
import { whichFirst } from "../../core/runner.js";

/**
 * The Python interpreter behind a console script on PATH (`pip`, `semgrep`):
 * the one whose `-m pip` acts on the installation that script belongs to.
 *
 * A bare `py` or `python` will not do. `py` runs whichever Python `py -0`
 * stars — often the free-threaded build when several 3.13 variants coexist —
 * and `python` the first one on PATH; neither is necessarily the interpreter
 * that installed the script. An upgrade through them lands in another site,
 * and the script on PATH keeps reporting its old version.
 *
 * Layouts, a Windows path staying a Windows path even when parsed on a POSIX
 * runner (the tests that mock `process.platform`), and vice versa:
 *   Windows → <prefix>\Scripts\<script>.exe ↔ <prefix>\python.exe, or
 *             Scripts\python.exe itself in a virtual environment
 *   POSIX   → <prefix>/bin/<script>         ↔ <prefix>/bin/{python3,python}
 *
 * Null when the script is not on PATH, or no interpreter sits where its
 * layout puts one.
 */
export async function pythonBehind(script: string): Promise<string | null> {
  const scriptPath = await whichFirst(script);
  if (!scriptPath) return null;
  for (const candidate of interpreterCandidates(scriptPath)) {
    if (await exists(candidate)) return candidate;
  }
  return null;
}

function interpreterCandidates(scriptPath: string): string[] {
  if (process.platform === "win32") {
    const scriptsDir = win32.dirname(scriptPath);
    return [
      win32.join(win32.dirname(scriptsDir), "python.exe"),
      win32.join(scriptsDir, "python.exe"),
    ];
  }
  const binDir = posix.dirname(scriptPath);
  const prefixBin = posix.join(posix.dirname(binDir), "bin");
  return [
    posix.join(binDir, "python3"),
    posix.join(binDir, "python"),
    posix.join(prefixBin, "python3"),
    posix.join(prefixBin, "python"),
  ];
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
