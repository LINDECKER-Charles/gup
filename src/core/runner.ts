import { execa, type Options, type ResultPromise } from "execa";

export interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  failed: boolean;
}

/**
 * Execa wrapper hardened for Windows console output:
 * - forces UTF-8 decoding to avoid garbled winget/choco output under cp65001,
 * - never throws on non-zero exit (callers inspect `failed`).
 */
export async function run(
  command: string,
  args: string[] = [],
  options: Options = {},
): Promise<RunResult> {
  const proc = execa(command, args, {
    reject: false,
    encoding: "utf8",
    stripFinalNewline: true,
    windowsHide: true,
    ...options,
  }) as ResultPromise;

  const result = await proc;
  return {
    stdout: String(result.stdout ?? ""),
    stderr: String(result.stderr ?? ""),
    exitCode: typeof result.exitCode === "number" ? result.exitCode : -1,
    failed: Boolean(result.failed) || result.exitCode !== 0,
  };
}

/** Stream output to the user's terminal (used during interactive updates). */
export async function runInherit(
  command: string,
  args: string[] = [],
  options: Options = {},
): Promise<RunResult> {
  const proc = execa(command, args, {
    reject: false,
    stdio: "inherit",
    windowsHide: true,
    ...options,
  }) as ResultPromise;

  const result = await proc;
  return {
    stdout: "",
    stderr: "",
    exitCode: typeof result.exitCode === "number" ? result.exitCode : -1,
    failed: Boolean(result.failed) || result.exitCode !== 0,
  };
}

export async function commandExists(command: string): Promise<boolean> {
  const probe = process.platform === "win32" ? "where" : "which";
  const result = await run(probe, [command]);
  return !result.failed && result.stdout.trim().length > 0;
}

/**
 * Return the absolute path of the first PATH resolution of `command`, or null
 * if not found. Used when the *location* matters (e.g. to verify which install
 * a binary belongs to), not just whether the binary exists.
 */
export async function whichFirst(command: string): Promise<string | null> {
  const probe = process.platform === "win32" ? "where" : "which";
  const result = await run(probe, [command]);
  if (result.failed) return null;
  const first = result.stdout.split(/\r?\n/)[0]?.trim();
  return first && first.length > 0 ? first : null;
}

/**
 * Windows: `net session` requires admin privileges, so its exit code is a
 * reliable cheap probe for elevation. Non-Windows always reports true since
 * the providers that care about this (choco) are Windows-only anyway.
 */
export async function isElevated(): Promise<boolean> {
  if (process.platform !== "win32") return true;
  const result = await run("net", ["session"]);
  return !result.failed;
}
