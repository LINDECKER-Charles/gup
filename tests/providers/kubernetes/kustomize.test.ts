import { describe, expect, it } from "vitest";
import { KustomizeProvider } from "../../../src/providers/kubernetes/kustomize.js";
import { installedVia } from "../../support/contract/installers.js";
import { system } from "../../support/system/fake-system.js";
import { kustomizeReleases } from "./kubernetes.cases.js";

/** kubernetes-sigs/kustomize tags every module's releases: only `kustomize/vX` is the CLI. */

describe("KustomizeProvider.listOutdated", () => {
  it("lists nothing when no recent release belongs to the kustomize module", async () => {
    const probe = { argv: ["kustomize", "version"], stdout: "v5.4.3" };
    const releases = kustomizeReleases("api/v0.18.0", "kyaml/v0.18.1", "cmd/config/v0.15.0");
    await system.load(installedVia("scoop", "kustomize", { commands: [probe], http: [releases] }));
    await expect(new KustomizeProvider().listOutdated()).resolves.toEqual([]);
  });
});
