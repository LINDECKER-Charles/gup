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
// space and parens for `C:\Program Files (x86)\…`). Anything outside this set
// is rejected before reaching execa. Combined with the per-provider argv
// validation, this guarantees no shell metacharacter can flow into the
// command name even on the shell-routed callsites (scoop's .cmd/.ps1 shim,
// see tests/security/shell-usage.test.ts allowlist) — and gives static
// analysis (CodeQL js/indirect-command-line-injection) an explicit sanitizer
// point: `sanitizeCommand`/`sanitizeArgs` return the cleaned value so the
// tainted-flow analysis sees the barrier, instead of a side-effecting assert
// the analyzer may not propagate through.
const SAFE_COMMAND_PATTERN = /^[A-Za-z0-9_.+\-/\\: ()]+$/;

function sanitizeCommand(command: string): string {
  if (typeof command !== "string" || command.length === 0) {
    throw new TypeError("runner: command must be a non-empty string");
  }
  if (!SAFE_COMMAND_PATTERN.test(command)) {
    throw new Error(`runner: refusing to spawn unsafe command name: ${command}`);
  }
  return command;
}

/**
 * Argv sanitization barrier. Each entry must be a string with no NUL byte —
 * NUL is illegal in POSIX argv and Win32 command lines anyway, but rejecting
 * it explicitly here both hardens the runner against caller bugs and gives
 * CodeQL a recognizable taint-cleansing point on the argv path. Shell
 * metacharacters in args are intentionally NOT rejected: `bash -lc <script>`
 * (sdkman) legitimately needs them, and execa with the default `shell: false`
 * passes argv as a vector — see tests/security/command-injection.test.ts.
 */
function sanitizeArgs(args: readonly string[]): readonly string[] {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (typeof arg !== "string") {
      throw new TypeError(`runner: argv[${i}] must be a string`);
    }
    if (arg.indexOf("\0") !== -1) {
      throw new Error(`runner: argv[${i}] must not contain NUL bytes`);
    }
  }
  return args;
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
  const proc = execa(safeCommand, safeArgs as string[], {
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
  const proc = execa(safeCommand, safeArgs as string[], {
    reject: false,
    stdio: "inherit",
    cancelSignal: controller.signal,
    ...execaOptions,
  }) as ResultPromise;

  let manuallyAborted = false;
  let timedOut = false;
  const abort = (reason: "manual" | "timeout"): void => {
    if (reason === "manual") manuallyAborted = true;
    else timedOut = true;
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

  try {
    const result = await proc;
    if (timedOut) pendingInterrupt.timedOut = true;
    if (manuallyAborted) pendingInterrupt.aborted = true;
    const out: RunResult = {
      stdout: "",
      stderr: "",
      exitCode: typeof result.exitCode === "number" ? result.exitCode : -1,
      failed: Boolean(result.failed) || result.exitCode !== 0,
    };
    if (timedOut) out.timedOut = true;
    if (manuallyAborted) out.aborted = true;
    return out;
  } finally {
    if (timer) clearTimeout(timer);
    abortCurrent = previous;
  }
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
