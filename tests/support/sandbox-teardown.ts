import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { sandboxRoot } from "./test-env.js";

/** Teardown removing a run's sandbox root, every worker's sandbox included. */
export function sandboxTeardown(root: string): () => Promise<void> {
  return async () => {
    await rm(root, { recursive: true, force: true });
  };
}

/**
 * Root globalSetup. Global setups run in the process that evaluated
 * vitest.config.ts, so `process.pid` names the very root the config handed to
 * the workers: the teardown can only ever delete the directory its own run
 * created.
 */
export default function setup(): () => Promise<void> {
  return sandboxTeardown(sandboxRoot(tmpdir(), process.pid));
}
