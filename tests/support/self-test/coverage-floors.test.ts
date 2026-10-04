import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { COVERAGE_FLOORS } from "../coverage-floors.js";

/**
 * A floor whose glob matches nothing guards nothing, and vitest says nothing
 * about it: after a move or a rename, the floor must follow its module.
 */

const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));

describe("coverage floors", () => {
  it.each(Object.keys(COVERAGE_FLOORS))("%s names source files that exist", async (glob) => {
    // The real fs: in the providers project, node:fs is the fake machine's.
    const { globSync } = await vi.importActual<typeof import("node:fs")>("node:fs");
    expect(globSync(glob, { cwd: REPO_ROOT }).filter((file) => file.endsWith(".ts"))).not.toEqual([]);
  });
});
