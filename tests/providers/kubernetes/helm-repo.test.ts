import { describe, expect, it } from "vitest";
import { HelmRepoProvider } from "../../../src/providers/kubernetes/helm-repo.js";
import { system } from "../../support/system/fake-system.js";
import { HELM_REPO_LIST, helmMachine } from "./plugins.cases.js";

/** `helm repo list -o json`: an array of repositories, nothing to refresh without one. */

describe("HelmRepoProvider", () => {
  it.each([
    ["fails", { exitCode: 1 }],
    ["prints no JSON", { stdout: "not-json" }],
    ["lists no repository", { stdout: "[]" }],
    ["prints something other than a list", { stdout: '{"name":"x"}' }],
  ])("hides itself when `helm repo list` %s", async (_label, answer) => {
    await system.load(helmMachine(HELM_REPO_LIST, answer));
    await expect(new HelmRepoProvider().isAvailable()).resolves.toBe(false);
  });

  it("lists nothing when no repository is configured", async () => {
    await system.load(helmMachine(HELM_REPO_LIST, { stdout: "[]" }));
    await expect(new HelmRepoProvider().listOutdated()).resolves.toEqual([]);
  });
});
