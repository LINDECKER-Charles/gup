import { describe, expect, it } from "vitest";
import { HelmPluginsProvider } from "../../../src/providers/kubernetes/helm-plugins.js";
import { system } from "../../support/system/fake-system.js";
import { HELM_PLUGIN_LIST, helmMachine } from "./plugins.cases.js";

/** `helm plugin list` is a table: a NAME/VERSION header, then one plugin per line. */

describe("HelmPluginsProvider", () => {
  it.each([
    ["fails", { exitCode: 1 }],
    ["prints its header only", { stdout: "NAME\tVERSION\tDESCRIPTION\n\n" }],
    ["prints no table at all", { stdout: "totally unrelated" }],
  ])("hides itself and lists nothing when `helm plugin list` %s", async (_label, answer) => {
    await system.load(helmMachine(HELM_PLUGIN_LIST, answer));
    const provider = new HelmPluginsProvider();
    await expect(provider.isAvailable()).resolves.toBe(false);
    await expect(provider.listOutdated()).resolves.toEqual([]);
  });
});
