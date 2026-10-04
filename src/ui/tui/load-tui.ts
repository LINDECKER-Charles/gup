import semver from "semver";
import { SCREEN_ERRORS } from "../text/menu-labels.js";

export type Tui = typeof import("@opentui/core");

/** First Node release with `node:ffi` on by default — OpenTUI loads its renderer through it. */
const MIN_NODE = "26.9.0";

let pending: Promise<Tui> | null = null;

/**
 * The OpenTUI module, loaded on first use.
 *
 * Kept out of the static import graph on purpose: the native renderer loads
 * through `node:ffi`, and only the interactive screens need it. `gup list
 * --json`, `gup update -y` and anything piped never pay for it.
 */
export function loadTui(): Promise<Tui> {
  pending ??= importQuietly().catch((err: unknown) => {
    throw new Error(describeLoadFailure(err), { cause: err });
  });
  return pending;
}

function describeLoadFailure(err: unknown): string {
  if (semver.lt(process.versions.node, MIN_NODE)) {
    return SCREEN_ERRORS.nodeTooOld(MIN_NODE, process.version);
  }
  const reason = err instanceof Error ? err.message : String(err);
  return SCREEN_ERRORS.loadFailed(reason);
}

/**
 * `node:ffi` still announces itself with an ExperimentalWarning on first load.
 * That line means nothing to someone updating their machine, so it is dropped
 * while the module loads, and every other warning goes through untouched.
 */
async function importQuietly(): Promise<Tui> {
  const emitWarning = process.emitWarning;
  process.emitWarning = function filtered(
    this: NodeJS.Process,
    warning: string | Error,
    ...rest: unknown[]
  ): void {
    if (isFfiExperimentalWarning(warning, rest[0])) return;
    (emitWarning as (...args: unknown[]) => void).call(this, warning, ...rest);
  } as typeof process.emitWarning;
  try {
    return await import("@opentui/core");
  } finally {
    process.emitWarning = emitWarning;
  }
}

function isFfiExperimentalWarning(warning: string | Error, typeOrOptions: unknown): boolean {
  const type =
    typeof typeOrOptions === "string"
      ? typeOrOptions
      : (typeOrOptions as { type?: string } | undefined)?.type;
  const message = typeof warning === "string" ? warning : warning.message;
  return type === "ExperimentalWarning" && /\bFFI\b/.test(message);
}
