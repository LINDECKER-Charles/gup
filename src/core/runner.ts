import { execa, type Options, type ResultPromise } from "execa";
import type { Readable } from "node:stream";
import { traceCommand } from "./process/command-tracer.js";
import {
  activeInheritSink,
  type InheritExit,
  type InheritProcess,
  type InheritRequest,
  type InheritSink,
} from "./process/inherit-sink.js";
import { LineSplitter } from "./process/line-splitter.js";

// PATH resolution lives in process/which.ts; providers keep importing it from
// here, next to the spawn functions it serves.
export { commandExists, whichFirst } from "./process/which.js";

/**
 * Windows looks for a bare command name in the working directory before
 * PATH — execa's resolver as much as cmd.exe — so gup started from a folder
 * holding a planted `npm.cmd` or `net.exe` would run that file instead of the
 * tool `whichFirst` found on PATH. Windows' own switch turns that lookup off.
 * Set once, before this module can spawn anything, on the process
 * environment every child inherits: the cmd.exe behind a `.cmd` shim does not
 * search there either.
 */
const NO_CWD_LOOKUP_ENV = "NoDefaultCurrentDirectoryInExePath";
if (process.platform === "win32") process.env[NO_CWD_LOOKUP_ENV] ??= "1";

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
// `C:\Users\JANEDO~1\scoop\shims\gh.exe` are ordinary PATH entries on a large
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

/**
 * Wall-clock cap per install, in seconds, when nothing overrides it
 * (GUP_INSTALL_TIMEOUT, `--timeout`, the persisted install setting, which
 * uses it as its default). 0 disables. 20 min: long enough for big
 * installers, short enough that a wedged one doesn't hang the whole run.
 */
export const DEFAULT_INSTALL_TIMEOUT_S = 1200;

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
// (never concurrent — see core/update/update-pipeline.ts), so a
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

/** taskkill's own cap: the exit of a killed install waits for it, so it must end. */
const TREE_KILL_TIMEOUT_MS = 10_000;

/**
 * Best-effort: kill the whole process tree on Windows. winget/choco spawn
 * installer children (msiexec, setup.exe) that a SIGTERM to the direct child
 * leaves orphaned; `taskkill /T` takes the tree down. Resolves once taskkill
 * returned, whatever it reported — never rejects. No-op when there's no pid
 * (e.g. the mocked child in tests) or off Windows, where the caller signals
 * the child (execa's cancelSignal) or its process group itself.
 */
export async function killProcessTree(pid: number | undefined): Promise<void> {
  if (process.platform !== "win32" || !pid || pid <= 0) return;
  try {
    await execa("taskkill", ["/pid", String(pid), "/t", "/f"], {
      reject: false,
      windowsHide: true,
      timeout: TREE_KILL_TIMEOUT_MS,
    });
  } catch {
    // Nothing left to kill, or taskkill itself failed: either way, done.
  }
}

/**
 * Wall-clock cap for {@link run}. Probes and scans are short by nature; the cap
 * only exists so one that never returns (a wedged `wsl.exe`, a tool stuck on a
 * lock or on a network that never answers) can't pin the scan forever.
 * Generous on purpose: `pwsh-modules` or `pip list --outdated` on a large
 * install legitimately take minutes. Callers can still pass their own `timeout`.
 */
const DEFAULT_PROBE_TIMEOUT_MS = 180_000;

/**
 * A probe never needs the keyboard, and its console is hidden (`windowsHide`).
 * With execa's default open stdin pipe, a child that prompts (a source
 * agreement, a credential, a `[Y/n]`) waits forever for input nobody can type;
 * NUL turns that wait into an immediate EOF. Callers that feed the child, or
 * pick its stdio themselves, keep their choice.
 */
function probeStdin(options: Options): { stdin?: "ignore" } {
  const isCallerManaged =
    options.input !== undefined ||
    options.inputFile !== undefined ||
    options.stdin !== undefined ||
    options.stdio !== undefined;
  return isCallerManaged ? {} : { stdin: "ignore" };
}

/**
 * Execa wrapper hardened for Windows console output:
 * - forces UTF-8 decoding to avoid garbled winget/choco output under cp65001,
 * - never throws on non-zero exit (callers inspect `failed`),
 * - validates `command` against {@link SAFE_COMMAND_PATTERN},
 * - always returns: stdin is closed, and a timeout kills the whole process
 *   tree. Killing only the direct child is no timeout on Windows: every
 *   `.cmd`/`.bat` tool runs under cmd.exe, and the real tool underneath keeps
 *   the output pipe open, so execa would keep waiting on it.
 */
export async function run(
  command: string,
  args: string[] = [],
  options: Options = {},
): Promise<RunResult> {
  const safeCommand = sanitizeCommand(command);
  const safeArgs = sanitizeArgs(args);
  const trace = traceCommand("probe", safeCommand, safeArgs);
  const proc = execa(safeCommand, safeArgs, {
    reject: false,
    encoding: "utf8",
    stripFinalNewline: true,
    windowsHide: true,
    timeout: DEFAULT_PROBE_TIMEOUT_MS,
    killDescendants: true,
    ...probeStdin(options),
    ...options,
  }) as ResultPromise;

  const result = await proc;
  const runResult: RunResult = {
    stdout: String(result.stdout ?? ""),
    stderr: String(result.stderr ?? ""),
    exitCode: exitCodeOf(result.exitCode),
    failed: Boolean(result.failed) || result.exitCode !== 0,
    ...(result.timedOut === true && { timedOut: true }),
  };
  trace.end(runResult);
  return runResult;
}

/**
 * Every option a `runInherit` caller uses: scoop's PowerShell shim needs the
 * shell, the Visual Studio and Cygwin installers a working directory. Narrower
 * than execa's options on purpose — whatever is accepted here must make sense
 * for every install sink, not only for the terminal.
 */
export interface InheritOptions {
  readonly cwd?: string;
  readonly shell?: boolean;
  /** Per-call cap in ms; 0 disables it. Defaults to the install timeout. */
  readonly timeout?: number;
}

/**
 * Run an install with the user's terminal attached (used during updates).
 *
 * Unlike {@link run}, this path:
 * - applies the per-install wall-clock timeout (so a wedged installer can't
 *   hang the run forever) and tree-kills on expiry,
 * - registers the child as interruptible so the Ctrl+C handler can skip it,
 * - does NOT pass `windowsHide`: an installer that ignores `--silent` and
 *   falls back to its GUI must show its window, otherwise it waits on a click
 *   to an invisible window and blocks indefinitely,
 * - hands the child to the active install sink instead of the terminal when
 *   one is routed (`process/inherit-sink.ts`). The request a sink receives has
 *   already been through both sanitisers.
 */
export async function runInherit(
  command: string,
  args: string[] = [],
  options: InheritOptions = {},
): Promise<RunResult> {
  const request = inheritRequest(command, args, options);
  const sink = activeInheritSink();
  const trace = traceCommand(sink?.mode ?? "inherit", request.command, request.args);
  const child = sink ? sink.start(request) : startInTerminal(request);
  const interrupts = armInterrupts(() => child.kill(), timeoutMsOf(options.timeout));
  try {
    const exit = await child.exited;
    if (interrupts.flags.timedOut) pendingInterrupt.timedOut = true;
    if (interrupts.flags.aborted) pendingInterrupt.aborted = true;
    const result = inheritResult(exit, interrupts.flags);
    trace.end({ ...result, ...(exit.outputTail !== undefined && { stdout: exit.outputTail }) });
    return result;
  } finally {
    interrupts.dispose();
  }
}

function inheritRequest(command: string, args: string[], options: InheritOptions): InheritRequest {
  return {
    command: sanitizeCommand(command),
    args: sanitizeArgs(args),
    ...(options.cwd !== undefined && { cwd: options.cwd }),
    ...(options.shell !== undefined && { shell: options.shell }),
  };
}

function timeoutMsOf(timeout: number | undefined): number {
  return typeof timeout === "number" ? timeout : installTimeoutSeconds * 1000;
}

/** The execa options that place a request: its working directory and shell routing. */
function placementOf(request: InheritRequest): Options {
  return {
    ...(request.cwd !== undefined && { cwd: request.cwd }),
    ...(request.shell !== undefined && { shell: request.shell }),
  };
}

/**
 * No sink routed: the child gets the user's terminal. One abort controller
 * serves both skip levers (timeout timer, Ctrl+C); on Windows the tree kill
 * also takes down the installer's own children.
 */
function startInTerminal(request: InheritRequest): InheritProcess {
  const controller = new AbortController();
  try {
    const proc = execa(request.command, [...request.args], {
      reject: false,
      stdio: "inherit",
      cancelSignal: controller.signal,
      ...placementOf(request),
    }) as ResultPromise;
    return killableChild(proc, controller, settled(proc));
  } catch {
    return exitedProcess();
  }
}

/**
 * A started child as an install process. A kill takes its whole tree down on
 * Windows, then aborts the child itself (the only kill elsewhere); its exit
 * also waits for both.
 *
 * Tree first: taskkill /T walks the tree from the pid it is given, so once
 * the abort killed that process — the cmd.exe behind a `.cmd` shim — it found
 * nothing, and the installer under it kept running, orphaned. And the exit
 * waits: reported while the installer still runs, the outcome would let a
 * provider repair what the installer left (npm's staged copy) under its feet.
 */
function killableChild(
  proc: ResultPromise,
  controller: AbortController,
  exit: Promise<InheritExit>,
): InheritProcess {
  let killed: Promise<void> = Promise.resolve();
  return {
    exited: exit.then(async (result) => {
      await killed;
      return result;
    }),
    kill: () => {
      killed = killProcessTree(proc.pid).then(() => controller.abort());
    },
  };
}

/** The exit of an execa child, as a promise that never rejects. */
function settled(proc: ResultPromise): Promise<InheritExit> {
  return proc.then(
    (result) => ({
      exitCode: typeof result.exitCode === "number" ? result.exitCode : NO_EXIT_CODE,
      failed: Boolean(result.failed) || result.exitCode !== 0,
    }),
    () => ({ exitCode: NO_EXIT_CODE, failed: true }),
  );
}

/** A child that could not even be started: already exited, failed. */
function exitedProcess(): InheritProcess {
  return { exited: Promise.resolve({ exitCode: NO_EXIT_CODE, failed: true }), kill: () => {} };
}

/**
 * Wire both skip levers — the wall-clock timer and the Ctrl+C handler — onto
 * the child's kill. Returns the flags they set plus the teardown that clears
 * the timer and restores the previous interruptible child.
 */
function armInterrupts(
  kill: () => void,
  timeoutMs: number,
): { flags: InterruptFlags; dispose: () => void } {
  const flags: InterruptFlags = { timedOut: false, aborted: false };
  const abort = (reason: "manual" | "timeout"): void => {
    if (reason === "manual") flags.aborted = true;
    else flags.timedOut = true;
    kill();
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
 * The child wrote to the terminal (or into a sink), so there is nothing to
 * hand back but the exit status and the interrupt cause.
 */
function inheritResult(exit: InheritExit, flags: InterruptFlags): RunResult {
  const out: RunResult = {
    stdout: "",
    stderr: "",
    exitCode: normalizeExitCode(exit.exitCode),
    failed: exit.failed,
  };
  if (flags.timedOut) out.timedOut = true;
  if (flags.aborted) out.aborted = true;
  return out;
}

export interface PipeSinkOptions {
  /** One whole line of a child's output (or a note from gup, on "stdout"). */
  readonly onLine: (line: string, stream: "stdout" | "stderr") => void;
  /** Bytes of lines kept per install and per stream; then one "output truncated" line. */
  readonly capBytes: number;
}

/**
 * An install sink for runs nobody watches (a scheduled run): no terminal, the
 * keyboard closed (`stdin: "ignore"` — a prompt reads EOF instead of hanging
 * forever), the output split into capped lines for a log. It lives here so
 * that execa stays imported by this module only. Like the terminal path, it
 * does not hide windows: a GUI installer that ignores its silent flag must be
 * visible rather than wait on an invisible window.
 */
export function createPipeSink(options: PipeSinkOptions): InheritSink {
  return {
    mode: "pipe",
    start: (request) => startPiped(request, options),
    note: (line) => options.onLine(line, "stdout"),
  };
}

function startPiped(request: InheritRequest, options: PipeSinkOptions): InheritProcess {
  const controller = new AbortController();
  try {
    const proc = execa(request.command, [...request.args], {
      reject: false,
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
      buffer: false,
      cancelSignal: controller.signal,
      ...placementOf(request),
    }) as ResultPromise;
    const flushers = [
      pipeLines(proc.stdout, (line) => options.onLine(line, "stdout"), options.capBytes),
      pipeLines(proc.stderr, (line) => options.onLine(line, "stderr"), options.capBytes),
    ];
    const exited = settled(proc).then((exit) => {
      for (const flush of flushers) flush();
      return exit;
    });
    return killableChild(proc, controller, exited);
  } catch {
    return exitedProcess();
  }
}

/** Split a child stream into lines; returns the flush to call once the child is gone. */
function pipeLines(
  stream: Readable | null,
  onLine: (line: string) => void,
  capBytes: number,
): () => void {
  const splitter = new LineSplitter({ capBytes, onLine });
  stream?.setEncoding("utf8");
  stream?.on("data", (chunk: string) => splitter.push(chunk));
  return () => splitter.end();
}

/**
 * Start a GUI or helper process that must outlive gup (the browser opening a
 * report) and leave it. Resolves true once it spawned, false when it could
 * not be started. The command and argv go through the same sanitisers as
 * every other spawn.
 *
 * On Windows execa hands a command it cannot resolve to cmd.exe, which spawns
 * fine and exits 1: there a missing binary reads as launched. Callers pass an
 * absolute path they have checked (explorer.exe under %SystemRoot%).
 */
export async function launchDetached(
  command: string,
  args: readonly string[] = [],
): Promise<boolean> {
  const safeCommand = sanitizeCommand(command);
  const safeArgs = sanitizeArgs(args);
  try {
    const child = execa(safeCommand, safeArgs, {
      detached: true,
      cleanup: false,
      stdio: "ignore",
      reject: false,
      // explorer.exe is a GUI-subsystem binary: there is no console to hide,
      // and SW_HIDE could be handed down to the window it opens.
      windowsHide: process.platform !== "win32",
    }) as ResultPromise;
    // execa's subprocess is no ChildProcess any more: the Node events and
    // unref() live on its documented `nodeChildProcess` escape hatch.
    const node = child.nodeChildProcess;
    const spawned = new Promise<boolean>((resolve) => node.once("spawn", () => resolve(true)));
    const isLaunched = await Promise.race([spawned, child.then(() => false, () => false)]);
    node.unref();
    return isLaunched;
  } catch {
    return false;
  }
}

/** Reported when the child has no exit code (killed by a signal, never spawned). */
const NO_EXIT_CODE = -1;

/** The child's exit code in its normalised form, or {@link NO_EXIT_CODE}. */
function exitCodeOf(exitCode: unknown): number {
  return typeof exitCode === "number" ? normalizeExitCode(exitCode) : NO_EXIT_CODE;
}

/**
 * One representation for an exit code, whoever reports it. A Windows exit
 * code is a 32-bit value that execa reports unsigned (`-1` comes back as
 * 4294967295, STATUS_CONTROL_C_EXIT as 3221225786), while `%ERRORLEVEL%`,
 * node-pty and installer documentation show it signed — Visual Studio's
 * "cancelled" is -1073741510. Reading it as signed makes those documented
 * values match; small codes (2, 1641, 3010) are the same either way. POSIX
 * exit statuses are 0..255 and pass through.
 */
export function normalizeExitCode(
  code: number,
  platform: NodeJS.Platform = process.platform,
): number {
  return platform === "win32" ? code | 0 : code;
}

const ROOT_UID = 0;

/**
 * Whether this process already holds administrator rights.
 *
 * Windows: `net session` requires admin privileges, so its exit code is a
 * reliable cheap probe. POSIX: running as root — the sudo'd elevated batch
 * child, or a user who started gup with sudo. Providers whose update needs
 * UAC or sudo flag their rows `requiresAdmin` only when this is false, so a
 * single prompt covers the whole batch.
 */
export async function isElevated(): Promise<boolean> {
  if (process.platform !== "win32") return process.getuid?.() === ROOT_UID;
  const result = await run("net", ["session"]);
  return !result.failed;
}
