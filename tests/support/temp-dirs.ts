import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach } from "vitest";

/**
 * Directories of the OS temp folder for the tests of one file, each removed
 * once the test that made it ends: a suite that writes works in its own
 * `mkdtemp` directory (test-env.ts), and leaves nothing behind it.
 *
 * Call it at the top of the file — it registers an `afterEach` — and make a
 * directory with the function it returns, in a `beforeEach` or in a test.
 * Removal never fails a test: a handle still open on Windows only leaves one
 * directory behind.
 */
export function useTempDirs(): (prefix: string) => Promise<string> {
  const made: string[] = [];
  afterEach(async () => {
    const removals = made.splice(0).map((dir) => rm(dir, REMOVAL).catch(() => undefined));
    await Promise.all(removals);
  });
  return async (prefix) => {
    const dir = await mkdtemp(join(tmpdir(), prefix));
    made.push(dir);
    return dir;
  };
}

const REMOVAL = { recursive: true, force: true, maxRetries: 3 } as const;
