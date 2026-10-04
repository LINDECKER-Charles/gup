import { afterEach, beforeEach, vi } from "vitest";
import { violationReport } from "./errors.js";
import { system } from "./fake-system.js";

/**
 * setupFile of the providers project: every test runs on the fake machine.
 * gup's own modules (gh-releases, install-source, ownership…) run for real
 * on top of it; only the boundaries are replaced:
 *
 * - the runner's spawning functions (the rest of the runner stays real);
 * - `node:fs` and `node:fs/promises`: the modelled functions answer from the
 *   fake tree, every other function is a usage error rather than the real disk;
 * - `node:os` homedir/tmpdir/platform, from the simulated identity;
 * - `fetch`.
 *
 * Externalised CommonJS dependencies (adm-zip) keep the real fs: vitest does
 * not transform node_modules, so their suites mock them explicitly.
 */

type AnyModule = Record<string, unknown>;

async function strictFsModule(name: string, real: AnyModule, fakes: AnyModule): Promise<AnyModule> {
  const { unsupportedFsFunction } = await import("./fake-fs.js");
  const module: AnyModule = {};
  for (const [key, value] of Object.entries(real)) {
    const isUnmodelled = typeof value === "function" && !(key in fakes);
    module[key] = isUnmodelled ? unsupportedFsFunction(name, key) : value;
  }
  return Object.assign(module, fakes);
}

vi.mock("../../../src/core/runner.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../../src/core/runner.js")>();
  const { fakeRunner } = await import("./fake-runner.js");
  return { ...real, ...fakeRunner };
});

vi.mock("node:fs/promises", async (importOriginal) => {
  const real = await importOriginal<typeof import("node:fs/promises")>();
  const { fakeFsPromises } = await import("./fake-fs.js");
  const module = await strictFsModule("fs/promises", real, fakeFsPromises);
  return { ...module, default: module };
});

vi.mock("node:fs", async (importOriginal) => {
  const real = await importOriginal<typeof import("node:fs")>();
  const { fakeFsPromises, fakeFsSync } = await import("./fake-fs.js");
  const realPromises = real.promises as unknown as AnyModule;
  const promises = await strictFsModule("fs/promises", realPromises, fakeFsPromises);
  const module = await strictFsModule("fs", real, { ...fakeFsSync, promises });
  return { ...module, default: module };
});

vi.mock("node:os", async (importOriginal) => {
  const real = await importOriginal<typeof import("node:os")>();
  const { fakeOs } = await import("./os-identity.js");
  const module = { ...real, ...fakeOs };
  return { ...module, default: module };
});

beforeEach(() => {
  system.reset();
  vi.stubGlobal("fetch", system.fetch);
});

afterEach(() => {
  const report = violationReport(system.unscripted);
  system.restore();
  vi.unstubAllGlobals();
  if (report) throw new Error(report);
});
