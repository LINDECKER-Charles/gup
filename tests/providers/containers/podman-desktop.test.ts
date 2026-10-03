import { describe, expect, it } from "vitest";
import { PodmanDesktopProvider } from "../../../src/providers/containers/podman-desktop.js";
import { system } from "../../support/system/fake-system.js";
import { githubLatest } from "../../support/system/releases.js";
import { desktopMachine, podmanMachine, versionInfoArgv } from "./containers.cases.js";

const RELEASE = githubLatest("containers/podman-desktop", "v1.13.0");

describe("PodmanDesktopProvider.listOutdated", () => {
  it("keeps a pre-release label and drops what follows the version", async () => {
    await system.load(podmanMachine("1.12.0-beta1   extra info", RELEASE));
    await expect(new PodmanDesktopProvider().listOutdated()).resolves.toMatchObject([
      { current: "1.12.0-beta1", latest: "1.13.0" },
    ]);
  });

  it("doubles a single quote of the exe path inside the PowerShell literal", async () => {
    const home = "C:\\Users\\O'Brien";
    const exe = `${home}\\AppData\\Local\\Programs\\podman-desktop\\Podman Desktop.exe`;
    const machine = desktopMachine({
      exe,
      probe: versionInfoArgv(exe),
      version: { stdout: "1.12.0" },
      release: RELEASE,
    });
    await system.load({ ...machine, env: { LOCALAPPDATA: `${home}\\AppData\\Local` } });
    await expect(new PodmanDesktopProvider().listOutdated()).resolves.toHaveLength(1);
    expect(system.trace.spawns[0]?.argv.at(-1)).toContain("'C:\\Users\\O''Brien\\");
  });
});
