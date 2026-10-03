import type { Options } from "execa";
import type { RunResult } from "../../../src/core/runner.js";
import { UnscriptedSpawnError } from "./errors.js";
import { argvKey, machine, type ResolvedAnswer } from "./machine.js";
import type { InstallAnswer, SpawnFaultMode, SpawnRecord } from "./types.js";

/**
 * Replacements for the runner exports that reach the machine. Everything else
 * the runner exports (timeout setting, skip lever…) stays real.
 *
 * `run()` answers, in order: an injected fault; `where`/`which` from `bin`;
 * the matching `CommandScript`; ENOENT for an absent binary; a strict-mode
 * `UnscriptedSpawnError` for a present binary nobody scripted.
 */

/** What execa resolves for a binary it cannot spawn (`reject: false`). */
const SPAWN_FAILURE: RunResult = { stdout: "", stderr: "", exitCode: -1, failed: true };

/** Output no parser should turn into a row: control bytes, half JSON, a bogus version. */
export const GARBAGE_OUTPUT =
  "\u0000\u001b[31m{not json] <<< ??? >>>\n\t-- 0x7f -- 9.9.9.9.9 --\r\n";

/** Path separators or wildcards: a path, never a PATH lookup (as the real `whichFirst`). */
const PATH_SEPARATORS = /[\\/:*?"<>|]/;

function strippedResult(answer: ResolvedAnswer): RunResult {
  // The real runner strips one final newline (`stripFinalNewline: true`).
  const strip = (text: string): string => text.replace(/\r?\n$/, "");
  return {
    stdout: strip(answer.stdout),
    stderr: strip(answer.stderr),
    exitCode: answer.exitCode,
    failed: answer.exitCode !== 0,
  };
}

function faultResult(mode: SpawnFaultMode, argv: readonly string[]): RunResult {
  switch (mode) {
    case "exit-1":
      return { stdout: "", stderr: "", exitCode: 1, failed: true };
    case "empty":
      return { stdout: "", stderr: "", exitCode: 0, failed: false };
    case "garbage":
      return { stdout: GARBAGE_OUTPUT, stderr: "", exitCode: 0, failed: false };
    case "timeout":
      return { stdout: "", stderr: "", exitCode: -1, failed: true, timedOut: true };
    case "rejects":
      throw new Error(`injected fault: runner rejected ${argvKey(argv)}`);
  }
}

function spawnFault(argv: readonly string[]): SpawnFaultMode | undefined {
  const key = argvKey(argv);
  for (const fault of machine().faults) {
    if (fault.on === "spawn" && argvKey(fault.argv) === key) return fault.mode;
  }
  return undefined;
}

function record(mode: SpawnRecord["mode"], argv: readonly string[], options: Options): void {
  const cwd = options.cwd === undefined ? undefined : String(options.cwd);
  const { timeout, env } = options;
  machine().spawns.push({
    mode,
    argv,
    shell: Boolean(options.shell),
    ...(cwd && { cwd }),
    ...(timeout !== undefined && { timeout }),
    ...(env !== undefined && { env: { ...env } }),
  });
}

function hasInstalled(): boolean {
  return machine().spawns.some((spawn) => spawn.mode === "inherit");
}

function isBareName(command: string): boolean {
  return command.length > 0 && !PATH_SEPARATORS.test(command);
}

function binaryPath(command: string): string | undefined {
  const state = machine();
  if (isBareName(command)) return state.bin.get(command);
  return state.fs.resolve(command)?.path;
}

function isPresent(command: string): boolean {
  return machine().isPermissive || binaryPath(command) !== undefined;
}

/** `where <bin>` (win32) and `which <bin>` (POSIX), answered from `bin`. */
function lookupAnswer(argv: readonly string[]): RunResult | undefined {
  const [command, name, ...rest] = argv;
  const state = machine();
  const lookup = state.platform === "win32" ? "where" : "which";
  if (command !== lookup || name === undefined || rest.length > 0) return undefined;
  const found = state.bin.get(name);
  if (found) return { stdout: found, stderr: "", exitCode: 0, failed: false };
  return { stdout: "", stderr: "", exitCode: 1, failed: true };
}

function scriptedAnswer(argv: readonly string[]): RunResult | undefined {
  const key = argvKey(argv);
  const slot = machine().scripts.find((script) => argvKey(script.argv) === key);
  if (!slot) return undefined;
  if (slot.afterInstall && hasInstalled()) return strippedResult(slot.afterInstall);
  const answer = slot.answers[Math.min(slot.calls, slot.answers.length - 1)];
  slot.calls += 1;
  return answer && strippedResult(answer);
}

function unscripted(argv: readonly string[]): RunResult {
  const state = machine();
  if (state.isPermissive) return { stdout: "", stderr: "", exitCode: 0, failed: false };
  if (state.isExploring) return faultResult("exit-1", argv);
  const error = new UnscriptedSpawnError(argv, state.scripts.map((script) => script.argv));
  state.unscripted.push(error);
  throw error;
}

async function run(
  command: string,
  args: string[] = [],
  options: Options = {},
): Promise<RunResult> {
  const argv = [command, ...args];
  record("run", argv, options);
  const fault = spawnFault(argv);
  if (fault) return faultResult(fault, argv);
  const answer = lookupAnswer(argv) ?? scriptedAnswer(argv);
  if (answer) return answer;
  return isPresent(command) ? unscripted(argv) : SPAWN_FAILURE;
}

function interrupted(flag: "timedOut" | "aborted"): RunResult {
  machine().interrupt[flag] = true;
  return { stdout: "", stderr: "", exitCode: -1, failed: true, [flag]: true };
}

/**
 * A spawn fault on an install. Its output went to the terminal, never to the
 * caller, so `empty` and `garbage` are plain successes there.
 */
const INHERIT_FAULTS: Readonly<Record<SpawnFaultMode, InstallAnswer>> = {
  "exit-1": { exitCode: 1 },
  empty: {},
  garbage: {},
  rejects: { rejects: true },
  timeout: { timedOut: true },
};

function installResult(answer: InstallAnswer, argv: readonly string[]): RunResult {
  if (answer.rejects) throw new Error(`injected fault: runner rejected ${argvKey(argv)}`);
  if (answer.timedOut) return interrupted("timedOut");
  if (answer.aborted) return interrupted("aborted");
  const exitCode = answer.exitCode ?? 0;
  return { stdout: "", stderr: "", exitCode, failed: exitCode !== 0 };
}

/** Installs answer from the `answerInstall` queue, exit 0 once it is empty. */
async function runInherit(
  command: string,
  args: string[] = [],
  options: Options = {},
): Promise<RunResult> {
  const argv = [command, ...args];
  record("inherit", argv, options);
  const fault = spawnFault(argv);
  const answer = fault ? INHERIT_FAULTS[fault] : machine().installAnswers.shift();
  return installResult(answer ?? {}, argv);
}

async function whichFirst(command: string): Promise<string | null> {
  if (!isBareName(command)) return null;
  const state = machine();
  const found = state.bin.get(command);
  if (found) return found;
  if (!state.isPermissive) return null;
  return state.platform === "win32" ? `C:\\fake\\bin\\${command}.exe` : `/usr/local/bin/${command}`;
}

async function commandExists(command: string): Promise<boolean> {
  return (await whichFirst(command)) !== null;
}

async function isElevated(): Promise<boolean> {
  return machine().isElevated;
}

/**
 * Faked too, although the spec lists five functions: the real one reads the
 * real runner's private slot, which the fake `runInherit` cannot reach.
 */
function consumeInterrupt(): { timedOut: boolean; aborted: boolean } {
  const state = machine();
  const flags = state.interrupt;
  state.interrupt = { timedOut: false, aborted: false };
  return flags;
}

export const fakeRunner = {
  run,
  runInherit,
  whichFirst,
  commandExists,
  isElevated,
  consumeInterrupt,
};
