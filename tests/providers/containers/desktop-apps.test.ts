import { describe, expect, it } from "vitest";
import type { Provider } from "../../../src/core/types.js";
import { DockerDesktopProvider } from "../../../src/providers/containers/docker-desktop.js";
import { PodmanDesktopProvider } from "../../../src/providers/containers/podman-desktop.js";
import { RancherDesktopProvider } from "../../../src/providers/containers/rancher-desktop.js";
import { system } from "../../support/system/fake-system.js";
import { probeArgvs } from "../../support/system/trace.js";
import { DESKTOP_EXES } from "./containers.cases.js";

/**
 * What Docker, Podman and Rancher Desktop share: they are found by their exe
 * in one of two Windows locations, and their version is only ever read on
 * Windows (through PowerShell's VersionInfo).
 */

interface DesktopLayout {
  readonly id: string;
  readonly create: () => Provider;
  /** The location looked at first, and the fallback. */
  readonly primary: string;
  readonly fallback: string;
  /** The variables both locations derive from. */
  readonly variables: readonly string[];
}

const LAYOUTS: readonly DesktopLayout[] = [
  {
    id: "docker-desktop",
    create: () => new DockerDesktopProvider(),
    primary: DESKTOP_EXES.docker,
    fallback: DESKTOP_EXES.dockerX86,
    variables: ["ProgramFiles", "ProgramFiles(x86)"],
  },
  {
    id: "podman-desktop",
    create: () => new PodmanDesktopProvider(),
    primary: DESKTOP_EXES.podman,
    fallback: DESKTOP_EXES.podmanMachineWide,
    variables: ["LOCALAPPDATA", "ProgramFiles"],
  },
  {
    id: "rancher-desktop",
    create: () => new RancherDesktopProvider(),
    primary: DESKTOP_EXES.rancher,
    fallback: DESKTOP_EXES.rancherMachineWide,
    variables: ["LOCALAPPDATA", "ProgramFiles"],
  },
];

function exeMachine(...paths: string[]) {
  const fs = Object.fromEntries(paths.map((path) => [path, { kind: "file" as const }]));
  return { platform: "win32" as const, fs };
}

describe.each(LAYOUTS)("$id", ({ create, primary, fallback, variables }) => {
  it("is found at its fallback location when the first one is empty", async () => {
    await system.load(exeMachine(fallback));
    await expect(create().isAvailable()).resolves.toBe(true);
    expect(system.trace.fsReads).toEqual([primary, fallback]);
  });

  it("is unavailable, looking nowhere, without the variables its locations come from", async () => {
    await system.load(exeMachine(primary, fallback));
    for (const variable of variables) delete process.env[variable];
    await expect(create().isAvailable()).resolves.toBe(false);
    expect(system.trace.fsReads).toEqual([]);
  });

  it("reads no version off Windows, even where its location seems to exist", async () => {
    const env = Object.fromEntries(variables.map((name) => [name, "C:\\Program Files"]));
    await system.load({ platform: "linux", env, permissive: true });
    await expect(create().listOutdated()).resolves.toEqual([]);
    expect(probeArgvs()).toEqual([]);
  });
});
