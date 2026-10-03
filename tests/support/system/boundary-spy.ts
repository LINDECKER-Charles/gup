import { type Mock, onTestFinished, vi } from "vitest";

type Procedure = (...args: never[]) => unknown;

/**
 * Replace one function of a faked boundary module (`node:fs`, `node:os`, the
 * runner) for the current test only. For the failures the fake machine does
 * not model because the real boundary never produces them on its own — an
 * `existsSync` that throws, an elevation probe that rejects, a `homedir()`
 * without a passwd entry — and that providers guard against all the same.
 *
 *   import * as fs from "node:fs";
 *   replaceForTest(fs, "existsSync", () => { throw new Error("EPERM"); });
 *
 * Returns the spy, for the rare test that asserts a boundary was never asked.
 */
export function replaceForTest<T extends object, K extends keyof T & string>(
  module: T,
  name: K,
  implementation: T[K] & Procedure,
): Mock<Procedure> {
  const target = module as unknown as Record<string, Procedure>;
  const spy = vi.spyOn(target, name).mockImplementation(implementation);
  onTestFinished(() => spy.mockRestore());
  return spy;
}
