import { isSupportedNode, MIN_NODE } from "../../src/core/node-floor.js";

/**
 * Root globalSetup: fail fast, with an actionable message, when the tests run
 * on a Node release gup does not support. Without it, a developer whose
 * default `node` is older sees the UI suites die on an obscure `node:ffi`
 * loading error, far from the cause.
 *
 * The floor is `MIN_NODE` (src/core/node-floor.ts), the one gup itself
 * enforces at start.
 */

/** Throws when `version` (e.g. `process.versions.node`) is older than `MIN_NODE`. */
export function assertSupportedNode(version: string): void {
  if (isSupportedNode(version)) return;
  throw new Error(
    `gup's tests need Node >=${MIN_NODE} (OpenTUI loads its renderer through node:ffi). ` +
      `Current: v${version}.`,
  );
}

export default function setup(): void {
  assertSupportedNode(process.versions.node);
}
