import { describe, expect, it } from "vitest";
import { PodmanDesktopProvider } from "../../../src/providers/containers/podman-desktop.js";
import { system } from "../../support/system/fake-system.js";
import { githubLatest } from "../../support/system/releases.js";
import { podmanMachine } from "./containers.cases.js";

const RELEASE = githubLatest("containers/podman-desktop", "v1.13.0");

describe("PodmanDesktopProvider.listOutdated", () => {
  it("keeps a pre-release label and drops what follows the version", async () => {
    await system.load(podmanMachine("1.12.0-beta1   extra info", RELEASE));
    await expect(new PodmanDesktopProvider().listOutdated()).resolves.toMatchObject([
      { current: "1.12.0-beta1", latest: "1.13.0" },
    ]);
  });

});
