import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { execa } from "execa";
import type { Sandbox } from "./sandbox.js";

/**
 * The built CLI, run the way a user runs it: `node dist/cli.js <args>`, with
 * stdout and stderr piped (so no TTY: the non-interactive paths), in the
 * sandbox's environment and nothing else.
 */

export const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
export const CLI_ENTRY = join(REPO_ROOT, "dist", "cli.js");
/** The program `dist/cli.js` loads. */
export const PROGRAM_ENTRY = join(REPO_ROOT, "dist", "main.js");
export const TRAMPOLINE_ENTRY = join(REPO_ROOT, "dist", "pty-exec.js");

/** Detection probes up to 150 tools on a slow CI disk; a scan may reach the network. */
const DEFAULT_TIMEOUT_MS = 90_000;

export interface CliRun {
  /** -1 when the process was killed (timeout) rather than exiting. */
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly ms: number;
  readonly timedOut: boolean;
}

export interface CliOptions {
  readonly sandbox: Sandbox;
  /** Written to stdin, which is then closed (default: nothing). */
  readonly input?: string;
  readonly timeoutMs?: number;
}

export async function runCli(args: readonly string[], options: CliOptions): Promise<CliRun> {
  const startedAt = performance.now();
  const result = await execa(process.execPath, [CLI_ENTRY, ...args], {
    env: options.sandbox.env,
    extendEnv: false,
    cwd: options.sandbox.root,
    input: options.input ?? "",
    reject: false,
    timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    windowsHide: true,
  });
  return {
    code: result.exitCode ?? -1,
    stdout: result.stdout,
    stderr: result.stderr,
    ms: Math.round(performance.now() - startedAt),
    timedOut: result.timedOut,
  };
}

/** `run` as one block for an assertion message: what the command printed and how it ended. */
export function describeRun(args: readonly string[], run: CliRun): string {
  return [
    `gup ${args.join(" ")} → exit ${run.code}${run.timedOut ? " (timed out)" : ""} in ${run.ms} ms`,
    `stdout:\n${run.stdout}`,
    `stderr:\n${run.stderr}`,
  ].join("\n");
}
