import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

import { runInherit } from "./runner.js";
import type { UpdateOutcome } from "./types.js";

/**
 * Shape of the temp file written by the parent before spawning the elevated
 * child. The child reads this, runs the targets via the normal provider
 * dispatch, and writes the matching {@link AdminBatchOutput} to `<file>.out`.
 *
 * The version field is mandatory so the IPC contract can evolve without the
 * parent and child silently drifting on stale on-disk payloads.
 */
export interface AdminBatchInput {
  version: 1;
  targets: string[];
}

export interface AdminBatchOutput {
  version: 1;
  outcomes: UpdateOutcome[];
}

/**
 * Default hook used to spawn the elevated child. Extracted into a single
 * function so tests can replace the actual UAC / sudo call with a mock that
 * writes the output file synchronously.
 */
export type ElevatedSpawner = (inputFile: string) => Promise<void>;

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
    await spawner(inputFile);
    return await readBatchOutput(outputFile, targets);
  } catch (err) {
    return targets.map((t) => fallbackFailure(t, err));
  } finally {
    await cleanup();
  }
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
  return parsed;
}

/** Mirror of {@link readBatchInput} for the outcomes file. */
export async function writeBatchOutput(file: string, outcomes: UpdateOutcome[]): Promise<void> {
  const payload: AdminBatchOutput = { version: 1, outcomes };
  await writeFile(file, JSON.stringify(payload), { encoding: "utf8" });
}

async function writeBatchInput(
  targets: string[],
): Promise<{ inputFile: string; cleanup: () => Promise<void> }> {
  const dir = await mkdtemp(join(tmpdir(), "gup-elevate-"));
  const inputFile = join(dir, `${randomBytes(8).toString("hex")}.json`);
  const payload: AdminBatchInput = { version: 1, targets };
  await writeFile(inputFile, JSON.stringify(payload), { encoding: "utf8" });
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
    if (parsed.version !== 1 || !Array.isArray(parsed.outcomes)) {
      throw new Error("malformed output payload");
    }
    return parsed.outcomes;
  } catch (err) {
    return targets.map((t) => fallbackFailure(t, err));
  }
}

function fallbackFailure(target: string, err: unknown): UpdateOutcome {
  const id = target.includes(":") ? target.slice(target.indexOf(":") + 1) : target;
  return {
    id,
    success: false,
    message: `Échec du process élevé : ${err instanceof Error ? err.message : String(err)}`,
  };
}

/**
 * Windows: PowerShell `Start-Process -Verb RunAs -Wait` triggers the UAC
 * prompt, runs the elevated child in a new console window, and blocks until
 * the child exits. Bonus on Windows 11 + sudo: a user with sudo enabled and
 * configured in "inline" mode can keep the output in the parent console;
 * we do not probe for sudo yet to keep the failure mode predictable.
 *
 * POSIX: there is no choco-grade admin requirement on Linux/macOS that this
 * CLI surfaces today, but `sudo` is the canonical fallback if the need
 * arises. Same contract: the child writes outcomes to `<inputFile>.out`.
 */
async function defaultSpawner(inputFile: string): Promise<void> {
  const node = process.execPath;
  const cli = process.argv[1];
  if (!cli) throw new Error("elevation: process.argv[1] is unset; cannot self-spawn");
  assertNoControlChars(node);
  assertNoControlChars(cli);
  assertNoControlChars(inputFile);

  if (process.platform === "win32") {
    const psCommand = [
      "Start-Process",
      "-FilePath",
      `'${psEscape(node)}'`,
      "-ArgumentList",
      `'${psEscape(cli)}','__admin-batch','${psEscape(inputFile)}'`,
      "-Verb",
      "RunAs",
      "-Wait",
    ].join(" ");
    // nosemgrep: gup-no-shell-true-with-variable
    const res = await runInherit("powershell.exe", [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      psCommand,
    ]);
    if (res.failed) throw new Error("PowerShell Start-Process élevé a échoué");
    return;
  }

  const res = await runInherit("sudo", [node, cli, "__admin-batch", inputFile]);
  if (res.failed) throw new Error("sudo a échoué ou a été refusé");
}

function psEscape(s: string): string {
  return s.replace(/'/g, "''");
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
