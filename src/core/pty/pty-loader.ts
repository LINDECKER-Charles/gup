import { createRequire } from "node:module";
import { dirname } from "node:path";
import { log } from "../log/log.js";
import { isSwitchedOff } from "../state/env-switch.js";
import { PTY_LABELS } from "./pty-labels.js";
import { ptyKill } from "./pty-kill.js";
import { isReleasableConpty, PtySession } from "./pty-session.js";
import { ensureSpawnHelper } from "./spawn-helper.js";
import { locateTrampoline, type TrampolineLocation } from "./trampoline.js";

/**
 * Whether installs can run in an embedded terminal, and with what. node-pty
 * is an optional dependency with a native part: it may be missing (Linux
 * without a build toolchain, `--omit=optional`), fail to load, or load and
 * still be unable to spawn (an antivirus quarantining `conpty.node`, which
 * loads lazily at the first spawn; macOS's `spawn-helper` without its exec
 * bit). Each case yields a French reason, and the menu then updates outside
 * the screen as before. Never throws.
 */

/** The node-pty version whose Windows internals `releaseConpty` relies on; package.json pins it. */
export const NODE_PTY_PIN = "1.1.0";

/**
 * Held in a variable typed `string` so that neither TypeScript nor the
 * bundler resolves it: gup builds and typechecks where the optional install
 * failed, and node-pty stays out of the bundle. The only mention of the
 * package in `src` (a drift test holds the line).
 */
const NODE_PTY_SPECIFIER: string = "node-pty";

const DISABLE_ENV = "GUP_PTY";

/** The probe: `node -e ""` in a small pseudo-terminal must exit 0 within this budget. */
export const PROBE_TIMEOUT_MS = 5_000;
const PROBE_ARGS = ["-e", ""];
const PROBE_COLS = 20;
const PROBE_ROWS = 5;
const MS_PER_SECOND = 1_000;

/** The node-pty subset gup uses — deliberately WITHOUT `kill()` (see pty-kill.ts). */
export interface PtyHandle {
  readonly pid: number;
  onData(listener: (data: string) => void): PtyDisposable;
  onExit(listener: (event: PtyExitEvent) => void): PtyDisposable;
  write(data: string | Buffer): void;
  resize(cols: number, rows: number): void;
}

export interface PtyDisposable {
  dispose(): void;
}

export interface PtyExitEvent {
  readonly exitCode: number;
  readonly signal?: number | undefined;
}

export interface PtySpawnOptions {
  readonly name: string;
  readonly cols: number;
  readonly rows: number;
}

export interface PtyModule {
  spawn(file: string, args: string[], options: PtySpawnOptions): PtyHandle;
}

export type EmbeddedTerminalSupport =
  | {
      readonly isAvailable: true;
      readonly pty: PtyModule;
      readonly trampoline: TrampolineLocation;
    }
  | { readonly isAvailable: false; readonly reason: string };

/** Every step of the detection, replaceable for tests and for the dev trampoline. */
export interface DetectionSteps {
  readonly env: NodeJS.ProcessEnv;
  readonly locate: () => TrampolineLocation | null;
  readonly importPty: () => Promise<unknown>;
  /** The path of a `spawn-helper` that is not executable, or null. */
  readonly prepareHelper: () => Promise<string | null>;
  /** Why the probe failed, or null when it passed. */
  readonly probe: (pty: PtyModule) => Promise<string | null>;
}

const DEFAULT_STEPS: DetectionSteps = {
  env: process.env,
  locate: () => locateTrampoline(),
  importPty: () => import(NODE_PTY_SPECIFIER),
  prepareHelper: prepareSpawnHelper,
  probe: probeSpawn,
};

let cached: Promise<EmbeddedTerminalSupport> | null = null;

/** {@link detectEmbeddedTerminal} with the real steps, once per process. */
export function loadEmbeddedTerminal(): Promise<EmbeddedTerminalSupport> {
  cached ??= detectEmbeddedTerminal();
  return cached;
}

/** Run the detection, uncached. Never rejects. */
export async function detectEmbeddedTerminal(
  overrides: Partial<DetectionSteps> = {},
): Promise<EmbeddedTerminalSupport> {
  const steps = { ...DEFAULT_STEPS, ...overrides };
  let support: EmbeddedTerminalSupport;
  try {
    support = await detect(steps);
  } catch (error) {
    support = unavailable(PTY_LABELS.probeFailed(messageOf(error)));
  }
  if (!support.isAvailable) log.info("pty.unavailable", { reason: support.reason });
  return support;
}

async function detect(steps: DetectionSteps): Promise<EmbeddedTerminalSupport> {
  if (isSwitchedOff(steps.env[DISABLE_ENV])) return unavailable(PTY_LABELS.disabled);
  const trampoline = steps.locate();
  if (!trampoline) return unavailable(PTY_LABELS.missingTrampoline);
  const pty = await importModule(steps);
  if (!pty) return unavailable(PTY_LABELS.missingModule);
  const helper = await steps.prepareHelper();
  if (helper !== null) return unavailable(PTY_LABELS.spawnHelper(helper));
  const failure = await steps.probe(pty);
  if (failure !== null) return unavailable(PTY_LABELS.probeFailed(failure));
  return { isAvailable: true, pty, trampoline };
}

async function importModule(steps: DetectionSteps): Promise<PtyModule | null> {
  try {
    const loaded = await steps.importPty();
    const spawn = spawnOf(loaded) ?? spawnOf(Reflect.get(Object(loaded), "default"));
    return spawn ? { spawn: checkedSpawn(spawn) } : null;
  } catch (error) {
    log.debug("pty.import-failed", { error: messageOf(error) });
    return null;
  }
}

type SpawnFunction = PtyModule["spawn"];

function spawnOf(candidate: unknown): SpawnFunction | null {
  const spawn: unknown =
    typeof candidate === "object" && candidate !== null ? Reflect.get(candidate, "spawn") : null;
  // A CommonJS export of node-pty: its typing is ours (pty-loader's PtyHandle).
  return typeof spawn === "function" ? (spawn as SpawnFunction) : null;
}

/**
 * On Windows every handle must be one `releaseConpty` can release; a node-pty
 * whose internals moved would leak a conhost per install. The probe goes
 * through this check, so such a version is reported unavailable up front.
 */
function checkedSpawn(spawn: SpawnFunction): SpawnFunction {
  return (file, args, options) => {
    const handle = spawn(file, args, options);
    if (process.platform === "win32" && !isReleasableConpty(handle)) {
      ptyKill.terminate(handle.pid);
      throw new Error(PTY_LABELS.unexpectedInternals(NODE_PTY_PIN));
    }
    return handle;
  };
}

async function prepareSpawnHelper(): Promise<string | null> {
  if (process.platform !== "darwin") return null;
  let manifest: string;
  try {
    manifest = createRequire(import.meta.url).resolve(`${NODE_PTY_SPECIFIER}/package.json`);
  } catch {
    return null;
  }
  return ensureSpawnHelper(dirname(manifest));
}

/**
 * Spawn `node -e ""`: on Windows `conpty.node` only loads at the first spawn,
 * so a successful import proves nothing yet.
 */
async function probeSpawn(pty: PtyModule): Promise<string | null> {
  const launch = { file: process.execPath, args: PROBE_ARGS, cols: PROBE_COLS, rows: PROBE_ROWS };
  const session = PtySession.start(pty, launch, () => {});
  const exit = await withinBudget(session.exited, PROBE_TIMEOUT_MS);
  if (exit === null) {
    session.kill();
    return PTY_LABELS.probeTimeout(PROBE_TIMEOUT_MS / MS_PER_SECOND);
  }
  return exit.exitCode === 0 ? null : PTY_LABELS.probeExitCode(exit.exitCode);
}

function withinBudget<T>(promise: Promise<T>, budgetMs: number): Promise<T | null> {
  let timer: NodeJS.Timeout | undefined;
  const expiry = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), budgetMs);
  });
  return Promise.race([promise, expiry]).finally(() => clearTimeout(timer));
}

function unavailable(reason: string): EmbeddedTerminalSupport {
  return { isAvailable: false, reason };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
