import { describe, expect, it } from "vitest";
import { CorepackProvider } from "../../../src/providers/node/corepack.js";
import { system } from "../../support/system/fake-system.js";
import { probeArgvs } from "../../support/system/trace.js";
import { COREPACK_BIN, COREPACK_MACHINE } from "./node.cases.js";

/**
 * Corepack only owns a package manager whose binary on PATH is its shim:
 * activating a version in its cache changes nothing for a standalone pnpm
 * that wins PATH resolution.
 */

const STANDALONE_PNPM = "C:\\Users\\u\\AppData\\Local\\pnpm\\pnpm.exe";

describe("CorepackProvider.listOutdated", () => {
  it("leaves a standalone pnpm alone, without even asking its version", async () => {
    const bin = { corepack: COREPACK_BIN, pnpm: STANDALONE_PNPM };
    await system.load({ ...COREPACK_MACHINE, bin });
    await expect(new CorepackProvider().listOutdated()).resolves.toEqual([]);
    expect(probeArgvs()).not.toContainEqual(["pnpm", "--version"]);
  });

  it("asks the registry nothing when corepack serves no package manager", async () => {
    await system.load({ ...COREPACK_MACHINE, bin: { corepack: COREPACK_BIN } });
    await expect(new CorepackProvider().listOutdated()).resolves.toEqual([]);
    expect(system.trace.requests).toEqual([]);
  });
});
