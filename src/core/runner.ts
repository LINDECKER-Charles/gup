import { execa, type Options, type ResultPromise } from "execa";

export interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  failed: boolean;
  /** Set when the wall-clock timeout fired and the child was killed. */
  timedOut?: boolean;
  /** Set when the user manually skipped this run (Ctrl+C → skipCurrent()). */
  aborted?: boolean;
}

// Allowlist for the `command` argument: alphanumerics + the path glyphs that
// appear in real binaries on either OS (`/`, `\`, `:` for Windows drives,
// space and parens for `C:\Program Files (x86)\…`, `~` for 8.3 short paths).
// Anything outside this set is rejected before reaching execa. Combined with
// the per-provider argv validation, this guarantees no shell metacharacter can
// flow into the command name even on the shell-routed callsites (scoop's
// .cmd/.ps1 shim, see tests/security/shell-usage.test.ts allowlist). The regex
// is anchored and uses an explicit character class so CodeQL's JS taint
// analysis recognises it as a sanitiser for
// js/shell-command-injection-from-environment and
// js/indirect-command-line-injection.
//
// `~` is load-bearing on Windows, not a convenience: 8.3 short paths are what
// the OS hands back for any directory whose name exceeds 8 characters or
// contains a space, so `C:\PROGRA~1\nodejs\npm.cmd` and
// `C:\Users\CHARLE~1\scoop\shims\gh.exe` are ordinary PATH entries on a large
// share of machines — %TEMP% itself is short-form for any username over 8
// characters. Without it, gup refuses to spawn a perfectly legitimate binary.
// It stays inert as far as injection goes: every callsite that derives a
// command name from a path runs through execa with shell interpretation off,
// where argv is passed as a vector and `~` is just a character; the one
// shell-routed callsite (scoop) passes a fixed literal, never a derived path.
// (Spelling out the opt-in flag here would trip the drift detector in
// tests/security/shell-usage.test.ts, which greps source text, comments
// included, and would read this file as a new shell callsite.)
const SAFE_COMMAND_PATTERN = /^[A-Za-z0-9_.+\-/\\:~ ()]+$/;

function sanitizeCommand(command: string): string {
  if (typeof command !== "string" || command.length === 0) {
    throw new TypeError("runner: command must be a non-empty string");
  }
  // Use `exec()` and return `match[0]` (not the original `command` after a
  // `.test()` check) so the value flowing out is a freshly-allocated string
  // captured from the anchored allowlist regex. CodeQL's tainted-flow
  // analysis treats regex-match results derived from a limited character
  // class as a sanitisation barrier; returning the raw input after a side-
  // effect-only `.test()` does not break the flow even though it is
  // semantically equivalent.
  const match = SAFE_COMMAND_PATTERN.exec(command);
  if (!match) {
    throw new Error(`runner: refusing to spawn unsafe command name: ${command}`);
  }
  return match[0];
}

// Defence-in-depth allowlist for argv entries. Permits the printable ASCII
// set plus the whitespace chars that legitimately appear in shell payloads
// passed to `bash -lc` (tab, LF, CR) and any non-ASCII codepoint (UTF-8
// package ids, paths with accented chars). Excludes the C0 control range
// except for those three whitespace chars — those have no legitimate use in
// argv and are how quoting bugs sneak through layered shells. Anchored +
// explicit character class so CodeQL recognises it as a sanitiser for
// js/indirect-command-line-injection.
// eslint-disable-next-line security/detect-unsafe-regex -- single character class with a `*` quantifier, fully anchored; no nested repetition. safe-regex false positive.
const SAFE_ARG_PATTERN = /^[\t\n\r\u0020-\u007e\u0080-\u{10ffff}]*$/u;

/**
 * Argv sanitisation barrier. Each entry must be a string that matches
 * {@link SAFE_ARG_PATTERN}; the returned array contains freshly-allocated
 * regex-match strings so the call site sees clean values (not the tainted
 * input references). Shell metacharacters in args are intentionally allowed:
 * `bash -lc <script>` (sdkman) legitimately needs them, and execa with the
 * default `shell: false` passes argv as a vector — see
 * tests/security/command-injection.test.ts.
 */
function sanitizeArgs(args: readonly string[]): string[] {
  const cleaned: string[] = new Array(args.length);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (typeof arg !== "string") {
      throw new TypeError(`runner: argv[${i}] must be a string`);
    }
    const match = SAFE_ARG_PATTERN.exec(arg);
    if (!match) {
      throw new Error(
        `runner: argv[${i}] contains a forbidden control character`,
      );
    }
    cleaned[i] = match[0];
  }
  return cleaned;
}

// ---------------------------------------------------------------------------
// Install timeout + manual-skip plumbing
//
// All real installs flow through runInherit() (providers stream their output
// to the terminal there; run() is reserved for scans/probes). So wiring the
// timeout and the Ctrl+C "skip" lever into runInherit covers every provider
// without touching any of them.
// ---------------------------------------------------------------------------

/** Wall-clock cap per install, in seconds. 0 disables. Overridable at runtime. */
// 20 min: long enough for big installers, short enough that a wedged one
// doesn't hang the whole run forever.
const DEFAULT_INSTALL_TIMEOUT_S = 1200;

function readEnvTimeoutSeconds(): number {
  const raw = process.env.GUP_INSTALL_TIMEOUT;
  if (raw === undefined || raw === "") return DEFAULT_INSTALL_TIMEOUT_S;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : DEFAULT_INSTALL_TIMEOUT_S;
}

let installTimeoutSeconds = readEnvTimeoutSeconds();

/** Set the per-install wall-clock timeout (seconds). 0 disables it. */
export function setInstallTimeoutSeconds(seconds: number): void {
  installTimeoutSeconds =
    Number.isFinite(seconds) && seconds >= 0 ? Math.floor(seconds) : 0;
}

/** Current per-install timeout in seconds (0 = disabled). */
export function getInstallTimeoutSeconds(): number {
  return installTimeoutSeconds;
}

// The currently-running interruptible child, if any. Updates are sequential
// (never concurrent — see commands/update.ts and ui/retry-failed.ts), so a
// single slot is enough; nested runInherit calls save/restore it.
let abortCurrent: (() => void) | null = null;

/**
 * Kill the install that's running right now (the Ctrl+C handler calls this).
 * Returns false when nothing interruptible is in flight, so the caller can
 * decide that the keypress means "abort the batch" instead.
 */
export function skipCurrent(): boolean {
  if (!abortCurrent) return false;
  abortCurrent();
  return true;
}

interface InterruptFlags {
  timedOut: boolean;
  aborted: boolean;
}

// runInherit can't return the interrupt cause to the batch loop through the
// provider (providers build their own UpdateOutcome and drop our RunResult
// flags). This one-slot channel bridges that gap: runInherit records the
// cause, the batch loop reads-and-clears it right after each provider.update().
// Safe because updates never run concurrently.
let pendingInterrupt: InterruptFlags = { timedOut: false, aborted: false };

/** Read and reset the interrupt flags recorded by the last runInherit call(s). */
export function consumeInterrupt(): InterruptFlags {
  const flags = pendingInterrupt;
  pendingInterrupt = { timedOut: false, aborted: false };
  return flags;
}

/**
 * Best-effort: kill the whole process tree on Windows. winget/choco spawn
 * installer children (msiexec, setup.exe) that a SIGTERM to the direct child
 * leaves orphaned; `taskkill /T` takes the tree down. Fire-and-forget — we
 * never await it and swallow any error. No-op when there's no pid (e.g. the
 * mocked child in tests) or off Windows (cancelSignal already SIGTERMs there).
 */
function treeKillWindows(pid: number | undefined): void {
  if (process.platform !== "win32" || !pid || pid <= 0) return;
  void execa("taskkill", ["/pid", String(pid), "/t", "/f"], {
    reject: false,
    windowsHide: true,
  }).catch(() => {});
}

/**
 * Execa wrapper hardened for Windows console output:
 * - forces UTF-8 decoding to avoid garbled winget/choco output under cp65001,
 * - never throws on non-zero exit (callers inspect `failed`),
 * - validates `command` against {@link SAFE_COMMAND_PATTERN}.
 */
export async function run(
  command: string,
  args: string[] = [],
  options: Options = {},
): Promise<RunResult> {
  const safeCommand = sanitizeCommand(command);
  const safeArgs = sanitizeArgs(args);
  const proc = execa(safeCommand, safeArgs, {
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

/**
 * Stream output to the user's terminal (used during interactive updates).
 *
 * Unlike {@link run}, this path:
 * - applies the per-install wall-clock timeout (so a wedged installer can't
 *   hang the run forever) and tree-kills on expiry,
 * - registers the child as interruptible so the Ctrl+C handler can skip it,
 * - does NOT pass `windowsHide`: an installer that ignores `--silent` and
 *   falls back to its GUI must show its window, otherwise it waits on a click
 *   to an invisible window and blocks indefinitely.
 */
export async function runInherit(
  command: string,
  args: string[] = [],
  options: Options = {},
): Promise<RunResult> {
  const safeCommand = sanitizeCommand(command);
  const safeArgs = sanitizeArgs(args);

  // We manage the timeout ourselves (own timer + tree-kill), so strip any
  // caller `timeout` from the execa options to avoid double-arming execa's
  // native timeout alongside ours.
  const { timeout: timeoutOverride, ...execaOptions } = options;
  const timeoutMs =
    typeof timeoutOverride === "number"
      ? timeoutOverride
      : installTimeoutSeconds * 1000;

  // One controller drives both skip levers — the timeout timer and the manual
  // Ctrl+C handler both abort it, which makes execa kill the child.
  const controller = new AbortController();
  const proc = execa(safeCommand, safeArgs, {
    reject: false,
    stdio: "inherit",
    cancelSignal: controller.signal,
    ...execaOptions,
  }) as ResultPromise;

  const interrupts = armInterrupts(proc, controller, timeoutMs);
  try {
    const result = await proc;
    if (interrupts.flags.timedOut) pendingInterrupt.timedOut = true;
    if (interrupts.flags.aborted) pendingInterrupt.aborted = true;
    return inheritResult(result, interrupts.flags);
  } finally {
    interrupts.dispose();
  }
}

/**
 * Wire both skip levers — the wall-clock timer and the Ctrl+C handler — onto
 * the child's abort controller. Returns the flags they set plus the teardown
 * that clears the timer and restores the previous interruptible child.
 */
function armInterrupts(
  proc: ResultPromise,
  controller: AbortController,
  timeoutMs: number,
): { flags: InterruptFlags; dispose: () => void } {
  const flags: InterruptFlags = { timedOut: false, aborted: false };
  const abort = (reason: "manual" | "timeout"): void => {
    if (reason === "manual") flags.aborted = true;
    else flags.timedOut = true;
    try {
      controller.abort();
    } catch {
      /* AbortController.abort doesn't throw; stay defensive anyway */
    }
    treeKillWindows((proc as { pid?: number }).pid);
  };

  const previous = abortCurrent;
  abortCurrent = () => abort("manual");
  const timer =
    timeoutMs > 0 ? setTimeout(() => abort("timeout"), timeoutMs) : null;

  return {
    flags,
    dispose: () => {
      if (timer) clearTimeout(timer);
      abortCurrent = previous;
    },
  };
}

/**
 * `stdio: "inherit"` means the child wrote straight to the terminal, so there
 * is nothing to hand back but the exit status and the interrupt cause.
 */
function inheritResult(
  result: { exitCode?: unknown; failed?: unknown },
  flags: InterruptFlags,
): RunResult {
  const out: RunResult = {
    stdout: "",
    stderr: "",
    exitCode: typeof result.exitCode === "number" ? result.exitCode : -1,
    failed: Boolean(result.failed) || result.exitCode !== 0,
  };
  if (flags.timedOut) out.timedOut = true;
  if (flags.aborted) out.aborted = true;
  return out;
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
