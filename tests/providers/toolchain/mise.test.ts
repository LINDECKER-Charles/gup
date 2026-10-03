import { describe, expect, it } from "vitest";
import { MiseProvider } from "../../../src/providers/toolchain/mise.js";
import { system } from "../../support/system/fake-system.js";
import { miseMachine } from "./toolchain.cases.js";

/** `mise outdated --json` changed shape across versions: an array, or an object keyed by tool. */

describe("MiseProvider.listOutdated", () => {
  it("skips incomplete and current entries, and falls back to the requested version", async () => {
    await system.load(
      miseMachine([
        { plugin: "node", current: "20.0.0", latest: "20.5.0" },
        { name: "python", current: "3.12.0", latest: "3.12.0" },
        { plugin: "missingLatest", current: "1.0.0" },
        { plugin: "missingCurrent", latest: "1.0.0" },
        { name: "withRequested", requested: "1.0.0", latest: "1.1.0" },
      ]),
    );
    await expect(new MiseProvider().listOutdated()).resolves.toEqual([
      { id: "node", name: "node", current: "20.0.0", latest: "20.5.0" },
      { id: "withRequested", name: "withRequested", current: "1.0.0", latest: "1.1.0" },
    ]);
  });

  it("reads the object form, keyed by tool name", async () => {
    await system.load(
      miseMachine({
        node: { current: "20.0.0", latest: "20.5.0" },
        python: { current: "3.12.0", latest: "3.12.0" },
      }),
    );
    await expect(new MiseProvider().listOutdated()).resolves.toEqual([
      { id: "node", name: "node", current: "20.0.0", latest: "20.5.0" },
    ]);
  });
});
