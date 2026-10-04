import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { randomBytes } from "node:crypto";

import { activeLocale, LOCALES, type Locale } from "./i18n/locale.js";
import { localized } from "./i18n/localized.js";
import { ingestElevatedLines } from "./log/elevated-bridge.js";
import { effectiveLogThreshold, LOG_THRESHOLDS, type LogThreshold } from "./log/log.js";
import { getInstallTimeoutSeconds, isElevated, runInherit } from "./runner.js";
import type { OutdatedPackage, UpdateOutcome } from "./types.js";

/** What every target of a batch the elevated child could not run reports, and why. */
const ELEVATION_FAILURE_LABELS = localized({
  en: {
    failed: (reason: string) => `Elevated process failed: ${reason}`,
    uacFailed: "elevated PowerShell Start-Process failed",
    sudoFailed: "sudo failed or was refused",
  },
  fr: {
    failed: (reason) => `Échec du process élevé : ${reason}`,
    uacFailed: "PowerShell Start-Process élevé a échoué",
    sudoFailed: "sudo a échoué ou a été refusé",
  },
});

/**
 * Shape of the temp file written by the parent before spawning the elevated
 * child. The child reads this, runs the targets via the normal provider
 * dispatch, and writes the matching {@link AdminBatchOutput} to `<file>.out`.
 *
 * The version field is mandatory so the IPC contract can evolve without the
 * parent and child silently drifting on stale on-disk payloads. The optional
 * fields carry the parent's effective settings: the elevated child never
 * reads the user's configuration (a user-writable file must not steer an
 * elevated process), so it learns them from the parent that spawned it.
 */
export interface AdminBatchInput {
  version: 1;
  targets: string[];
  /** The parent's per-install timeout, 0 = none. */
  installTimeoutSeconds?: number;
  /** The parent's log threshold, so the child's log lines match it. */
  logThreshold?: LogThreshold;
  /** The parent's language, so the outcomes the child writes read like the parent's. */
  locale?: Locale;
}

/**
 * The hidden command the elevated child runs. The Windows wrapper script
 * spells it as a literal on purpose: that script is a constant, with no
 * value woven into it.
 */
export const ADMIN_BATCH_COMMAND = "__admin-batch";

/** Upper bound of an install timeout carried by the payload: one day. */
const MAX_INSTALL_TIMEOUT_S = 86_400;

/**
 * What the UAC prompt and the user's reading of it may take on top of the
 * installs themselves, so the wait does not kill a batch that is still
 * waiting to be accepted.
 */
const ELEVATION_PROMPT_GRACE_MS = 300_000;

export interface AdminBatchOutput {
  version: 1;
  outcomes: UpdateOutcome[];
  /**
   * The child's debug log records, for the parent to write: the elevated
   * child never writes into the user's log directory. Optional both ways, so
   * a parent and a child of different versions still understand each other.
   */
  log?: string[];
}

/**
 * Default hook used to spawn the elevated child. Extracted into a single
 * function so tests can replace the actual UAC / sudo call with a mock that
 * writes the output file synchronously. `targetCount` sizes the wait.
 */
export type ElevatedSpawner = (inputFile: string, targetCount: number) => Promise<void>;

/**
 * Run a pre-validated set of `provider:packageId` targets inside an elevated
 * gup child and collect the outcomes through a temp-file round-trip.
 *
 * The targets array is treated as data the caller has already validated
 * against the standard format; this function never parses or trusts the
 * strings further than writing them to a JSON file the elevated child reads.
 * If the child dies, refuses elevation, or produces no readable output,
 * every target is surfaced as a failure with the underlying error message
 * so the outcome summary does not silently lose entries.
 */
export async function runElevatedBatch(
  targets: string[],
  spawner: ElevatedSpawner = defaultSpawner,
): Promise<UpdateOutcome[]> {
  if (targets.length === 0) return [];
  const { inputFile, cleanup } = await writeBatchInput(targets);
  const outputFile = `${inputFile}.out`;
  try {
    await spawner(inputFile, targets.length);
    return await readBatchOutput(outputFile, targets);
  } catch (err) {
    return targets.map((t) => fallbackFailure(t, err));
  } finally {
    await cleanup();
  }
}

/**
 * Scan rows whose update needs UAC or sudo, made ready for the elevated
 * batch: flagged `requiresAdmin` unless this process already runs elevated
 * (the batch child itself, or gup started with sudo), in which case they
 * update in place without any prompt.
 */
export async function flagForElevation(rows: OutdatedPackage[]): Promise<OutdatedPackage[]> {
  if (rows.length === 0 || (await isElevated())) return rows;
  return rows.map((row) => ({ ...row, requiresAdmin: true }));
}

/**
 * Read and validate the batch input file. Exported so the elevated child
 * (commands/admin-batch.ts) and the IPC tests use the exact same contract.
 */
export async function readBatchInput(file: string): Promise<AdminBatchInput> {
  const raw = await readFile(file, "utf8");
  const parsed = JSON.parse(raw) as AdminBatchInput;
  if (parsed.version !== 1) {
    throw new Error(`admin-batch: unsupported version ${parsed.version}`);
  }
  if (!Array.isArray(parsed.targets) || parsed.targets.some((t) => typeof t !== "string")) {
    throw new Error("admin-batch: targets must be a string array");
  }
  assertSettings(parsed);
  return parsed;
}

/** The optional settings, when present, must be exactly what the parent writes. */
function assertSettings(input: AdminBatchInput): void {
  const { installTimeoutSeconds, logThreshold, locale } = input;
  const isTimeoutValid =
    installTimeoutSeconds === undefined ||
    (Number.isInteger(installTimeoutSeconds) &&
      installTimeoutSeconds >= 0 &&
      installTimeoutSeconds <= MAX_INSTALL_TIMEOUT_S);
  if (!isTimeoutValid) {
    throw new Error(
      `admin-batch: installTimeoutSeconds must be an integer in 0..${MAX_INSTALL_TIMEOUT_S}`,
    );
  }
  if (logThreshold !== undefined && !LOG_THRESHOLDS.includes(logThreshold)) {
    throw new Error("admin-batch: logThreshold must be a log level or off");
  }
  if (locale !== undefined && !LOCALES.includes(locale)) {
    throw new Error(`admin-batch: locale must be one of ${LOCALES.join(", ")}`);
  }
}

/**
 * How long the parent waits for the elevated child: every install may take
 * the full install timeout, plus the time to accept the prompt. Waiting a
 * single timeout for the whole batch killed the waiter — not the child,
 * which keeps installing in its own window — and lost every outcome.
 * 0 (no limit) when the install timeout is off.
 */
export function elevatedWaitMs(
  targetCount: number,
  installTimeoutSeconds: number = getInstallTimeoutSeconds(),
): number {
  if (installTimeoutSeconds === 0) return 0;
  return installTimeoutSeconds * 1000 * targetCount + ELEVATION_PROMPT_GRACE_MS;
}

/**
 * Mirror of {@link readBatchInput} for the outcomes file. The `wx` flag
 * forbids overwriting an existing file at the same path — the elevated
 * child must hit a freshly-created location, never a pre-staged one.
 */
export async function writeBatchOutput(
  file: string,
  outcomes: UpdateOutcome[],
  log: readonly string[] = [],
): Promise<void> {
  const payload: AdminBatchOutput = {
    version: 1,
    outcomes,
    ...(log.length > 0 && { log: [...log] }),
  };
  await writeFile(file, JSON.stringify(payload), { encoding: "utf8", flag: "wx" });
}

async function writeBatchInput(
  targets: string[],
): Promise<{ inputFile: string; cleanup: () => Promise<void> }> {
  // mkdtemp creates the parent directory with permissions tied to the
  // current user, and the file we write inside it is opened with the
  // exclusive-create flag (`wx`): together they shut down the classic
  // TOCTOU race on a shared tmp dir that CodeQL flags as
  // "Insecure creation of file in the os temp dir".
  const dir = await mkdtemp(join(tmpdir(), "gup-elevate-"));
  const inputFile = join(dir, `${randomBytes(8).toString("hex")}.json`);
  const payload: AdminBatchInput = {
    version: 1,
    targets,
    installTimeoutSeconds: Math.min(getInstallTimeoutSeconds(), MAX_INSTALL_TIMEOUT_S),
    logThreshold: effectiveLogThreshold(),
    locale: activeLocale(),
  };
  await writeFile(inputFile, JSON.stringify(payload), { encoding: "utf8", flag: "wx" });
  return {
    inputFile,
    cleanup: async () => {
      // rm with force/recursive swallows the ENOENT of an already-deleted .out
      // and removes the whole randomised tmp dir in one syscall.
      await rm(dir, { recursive: true, force: true });
    },
  };
}

async function readBatchOutput(file: string, targets: string[]): Promise<UpdateOutcome[]> {
  try {
    const raw = await readFile(file, "utf8");
    const parsed = JSON.parse(raw) as AdminBatchOutput;
    forwardChildLog(parsed);
    if (parsed.version !== 1 || !Array.isArray(parsed.outcomes)) {
      throw new Error("malformed output payload");
    }
    // The parent maps outcomes to targets by array index — so the child MUST
    // emit exactly one outcome per requested target, in the same order. If the
    // length differs we cannot recover a safe mapping (silently dropping or
    // shifting outcomes would lie to the user), so surface every requested
    // target as a generic failure with a precise message instead.
    if (parsed.outcomes.length !== targets.length) {
      throw new Error(
        `outcomes length mismatch: expected ${targets.length}, got ${parsed.outcomes.length}`,
      );
    }
    // Defensive per-entry shape check: anything that doesn't look like a
    // valid UpdateOutcome gets replaced with a synthetic failure tied to
    // the matching target id, so the summary keeps one row per request.
    return parsed.outcomes.map((o, i) =>
      isWellFormedOutcome(o) ? o : fallbackFailure(targets[i] ?? "", new Error("malformed outcome entry")),
    );
  } catch (err) {
    return targets.map((t) => fallbackFailure(t, err));
  }
}

/**
 * The child's log, written to this process's log before the outcomes are
 * checked: when they turn out malformed, its lines are what explains why.
 * Isolated: a bad log never changes what the outcomes say.
 */
function forwardChildLog(output: unknown): void {
  try {
    if (typeof output === "object" && output !== null) {
      ingestElevatedLines((output as { log?: unknown }).log);
    }
  } catch {
    // The bridge does not throw; this guard keeps the outcomes safe if it ever does.
  }
}

function isWellFormedOutcome(o: unknown): o is UpdateOutcome {
  return (
    typeof o === "object" &&
    o !== null &&
    typeof (o as UpdateOutcome).id === "string" &&
    typeof (o as UpdateOutcome).success === "boolean"
  );
}

function fallbackFailure(target: string, err: unknown): UpdateOutcome {
  const id = target.includes(":") ? target.slice(target.indexOf(":") + 1) : target;
  return {
    id,
    success: false,
    message: ELEVATION_FAILURE_LABELS.failed(err instanceof Error ? err.message : String(err)),
  };
}

/**
 * Windows: PowerShell `Start-Process -Verb RunAs -Wait` triggers the UAC
 * prompt, runs the elevated child in a new console window, and blocks until
 * the child exits. Bonus on Windows 11 + sudo: a user with sudo enabled and
 * configured in "inline" mode can keep the output in the parent console;
 * we do not probe for sudo yet to keep the failure mode predictable.
 *
 * POSIX: `sudo` runs the child as root, so the providers whose updates shell
 * `sudo` themselves (MacPorts, Fink, pkgin, apt/dnf delegations) run inside it
 * without prompting again — one password for the whole batch. Same contract:
 * the child writes outcomes to `<inputFile>.out`.
 */
async function defaultSpawner(inputFile: string, targetCount: number): Promise<void> {
  const node = process.execPath;
  const cli = process.argv[1];
  if (!cli) throw new Error("elevation: process.argv[1] is unset; cannot self-spawn");
  for (const value of [node, cli, inputFile]) assertNoControlChars(value);
  const launch: ElevatedLaunch = { node, cli, inputFile, timeout: elevatedWaitMs(targetCount) };
  if (process.platform === "win32") return spawnWithUac(launch);
  return spawnWithSudo(launch);
}

/** The elevated child to start, already checked, and how long to wait for it. */
interface ElevatedLaunch {
  readonly node: string;
  readonly cli: string;
  readonly inputFile: string;
  readonly timeout: number;
}

/**
 * The UAC launcher, a constant: the elevated paths arrive as `$args` when it
 * runs as `powershell.exe -File spawn.ps1 <node> <cli> <inputFile>`, never as
 * text woven into it. execa hands PowerShell an argv vector, so the only
 * env-derived inputs flow as data, never as code — the taint flow CodeQL's
 * `js/shell-command-injection-from-environment` tracks stays broken.
 *
 * Start-Process joins `-ArgumentList` with spaces and quotes nothing: each
 * path is wrapped in double quotes here. Unquoted, a path with a space (a
 * profile named "Jane Doe", an npm prefix under Program Files) reached the
 * elevated node split in two, and node tried to load the truncated path as a
 * module — as administrator. `-FilePath` is a single value and needs none.
 */
const UAC_WRAPPER_SCRIPT =
  "$ErrorActionPreference = 'Stop'\r\n" +
  "Start-Process -FilePath $args[0] -Verb RunAs -Wait" +
  " -ArgumentList ('\"' + $args[1] + '\"'),'__admin-batch',('\"' + $args[2] + '\"')\r\n";

async function spawnWithUac({ node, cli, inputFile, timeout }: ElevatedLaunch): Promise<void> {
  for (const path of [cli, inputFile]) assertQuotable(path);
  const ps1 = join(dirname(inputFile), "spawn.ps1");
  await writeFile(ps1, UAC_WRAPPER_SCRIPT, { encoding: "utf8", flag: "wx" });
  const powershellArgs = ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File"];
  const res = await runInherit("powershell.exe", [...powershellArgs, ps1, node, cli, inputFile], {
    timeout,
  });
  if (res.failed) throw new Error(ELEVATION_FAILURE_LABELS.uacFailed);
}

/**
 * POSIX: argv vector, no shell, no concat — node/cli/inputFile arrive as
 * discrete sudo arguments. Same property as the Windows path: only data
 * flows through env-derived inputs, never code.
 */
async function spawnWithSudo({ node, cli, inputFile, timeout }: ElevatedLaunch): Promise<void> {
  const res = await runInherit("sudo", [node, cli, ADMIN_BATCH_COMMAND, inputFile], { timeout });
  if (res.failed) throw new Error(ELEVATION_FAILURE_LABELS.sudoFailed);
}

/**
 * Defence in depth: every argv value flowing through the elevated spawn line
 * is program-controlled (process.execPath, our argv[1], a tmp file we just
 * created) but we still refuse to forward ASCII control characters. They
 * can't legitimately appear in a Windows path, and they're how shell-line
 * injection bugs sneak through quoting layers.
 */
function assertNoControlChars(s: string): void {
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    if (code < 32 || code === 127) {
      throw new Error(
        `elevation: refusing to spawn with control char in argv: ${JSON.stringify(s)}`,
      );
    }
  }
}

/**
 * A path the UAC launcher can wrap in double quotes: one holding a quote (no
 * Windows path does) or ending in a backslash (it would escape the closing
 * quote) is refused rather than handed, mangled, to an elevated process.
 */
function assertQuotable(path: string): void {
  if (path.includes('"') || path.endsWith("\\")) {
    throw new Error(`elevation: refusing to quote ${JSON.stringify(path)} for Start-Process`);
  }
}
