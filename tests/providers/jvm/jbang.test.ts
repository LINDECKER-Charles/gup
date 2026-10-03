import { describe, expect, it } from "vitest";
import { JBangProvider } from "../../../src/providers/jvm/jbang.js";
import { system } from "../../support/system/fake-system.js";
import { jbangMachine } from "./jvm.cases.js";

/** `jbang version` prints the version on its first line; whatever follows is chatter. */

describe("JBangProvider.listOutdated", () => {
  it("reads the version off the first line only, a v prefix dropped", async () => {
    await system.load(jbangMachine("v0.118.0\n[jbang] a newer version 0.120.1 is available"));
    await expect(new JBangProvider().listOutdated()).resolves.toEqual([
      { id: "jbang", name: "JBang", current: "0.118.0", latest: "0.119.0" },
    ]);
  });

  it("lists nothing, and asks GitHub nothing, when the first line holds no version", async () => {
    await system.load(jbangMachine("not-a-version\n0.118.0"));
    await expect(new JBangProvider().listOutdated()).resolves.toEqual([]);
    expect(system.trace.requests).toEqual([]);
  });
});
