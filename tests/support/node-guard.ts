import semver from "semver";
import manifest from "../../package.json" with { type: "json" };

/**
 * Root globalSetup: fail fast, with an actionable message, when the tests run
 * on a Node release gup does not support. Without it, a developer whose
 * default `node` is older sees the UI suites die on an obscure `node:ffi`
 * loading error, far from the cause.
 *
 * The supported range is `package.json#engines.node`, the single source of
 * truth the published package already declares.
 */

/** Throws when `version` (e.g. `process.versions.node`) is outside `range`. */
export function assertSupportedNode(version: string, range: string): void {
  if (semver.satisfies(version, range)) return;
  throw new Error(
    `gup's tests need Node ${range} (OpenTUI loads its renderer through node:ffi). ` +
      `Current: v${version}.`,
  );
}

export default function setup(): void {
  assertSupportedNode(process.versions.node, manifest.engines.node);
}
