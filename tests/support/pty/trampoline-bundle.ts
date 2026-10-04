import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { build } from "tsup";
import type { TrampolineLocation } from "../../../src/core/pty/trampoline.js";

/**
 * The trampoline built the way `npm run build` builds it (`tsup.config.ts`:
 * ESM, node26, dependencies left external). The integration suites run this
 * bundle rather than the TypeScript source under tsx: it is what users run,
 * and the tsx loader would add its own start-up time to every timing.
 *
 * It is written under `node_modules/.cache/`, inside the repository, so its
 * external imports (execa…) resolve from the project's `node_modules` exactly
 * as `dist/pty-exec.js` does.
 */
export interface BundledTrampoline {
  readonly location: TrampolineLocation;
  dispose(): Promise<void>;
}

export async function bundleTrampoline(): Promise<BundledTrampoline> {
  const cache = join(process.cwd(), "node_modules", ".cache");
  await mkdir(cache, { recursive: true });
  const outDir = await mkdtemp(join(cache, "gup-pty-exec-"));
  await build({
    entry: { "pty-exec": join(process.cwd(), "src", "pty-exec.ts") },
    outDir,
    format: ["esm"],
    target: "node26",
    platform: "node",
    external: ["node-pty"],
    splitting: false,
    clean: false,
    config: false,
    silent: true,
  });
  return {
    location: { script: join(outDir, "pty-exec.js"), execArgv: [] },
    dispose: () => rm(outDir, { recursive: true, force: true }),
  };
}

/** The trampoline as `tsx src/cli.ts` finds it: the TypeScript source and the tsx loader. */
export function sourceTrampoline(): TrampolineLocation {
  return {
    script: join(process.cwd(), "src", "pty-exec.ts"),
    execArgv: ["--import", import.meta.resolve("tsx")],
  };
}
