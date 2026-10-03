import type { Provider } from "../../../src/core/types.js";
import { DiveProvider } from "../../../src/providers/containers/dive.js";
import { DockerDesktopProvider } from "../../../src/providers/containers/docker-desktop.js";
import { NerdctlProvider } from "../../../src/providers/containers/nerdctl.js";
import { OrasProvider } from "../../../src/providers/containers/oras.js";
import { PodmanDesktopProvider } from "../../../src/providers/containers/podman-desktop.js";
import { RancherDesktopProvider } from "../../../src/providers/containers/rancher-desktop.js";
import { type ReleasedTool, releasedToolCases } from "../../support/contract/released-tool.js";
import type { ProviderContractCase } from "../../support/contract/types.js";
import { WIN_HOME } from "../../support/system/os-identity.js";
import { githubLatest } from "../../support/system/releases.js";
import type { CommandAnswer, HttpRoute, SystemSpec } from "../../support/system/types.js";

/**
 * Container tooling: three CLIs released on GitHub whose upgrade goes to the
 * installer that owns them, and three Windows desktop apps that update
 * themselves from their own GUI — gup reads their file version through
 * PowerShell and only reports. The machines a knowledge test starts from are
 * exported.
 */

// --- CLIs -----------------------------------------------------------------------

const DIVE: ReleasedTool = {
  create: () => new DiveProvider(),
  id: "dive",
  name: "dive",
  binary: "dive",
  probe: { argv: ["dive", "--version"], stdout: "dive 0.12.0" },
  current: "0.12.0",
  release: githubLatest("wagoodman/dive", "v0.13.1"),
  latest: "0.13.1",
  upToDate: githubLatest("wagoodman/dive", "v0.12.0"),
  delegation: {
    ids: { scoop: "dive", choco: "dive", winget: "wagoodman.dive", brew: "dive" },
    manualMessage: "Télécharger https://github.com/wagoodman/dive/releases et remplacer dive.exe",
  },
};

const NERDCTL: ReleasedTool = {
  create: () => new NerdctlProvider(),
  id: "nerdctl",
  name: "nerdctl",
  binary: "nerdctl",
  probe: { argv: ["nerdctl", "--version"], stdout: "nerdctl version 1.7.6" },
  current: "1.7.6",
  release: githubLatest("containerd/nerdctl", "v2.0.3"),
  latest: "2.0.3",
  upToDate: githubLatest("containerd/nerdctl", "v1.7.6"),
  delegation: {
    ids: { scoop: "nerdctl", brew: "nerdctl" },
    manualMessage:
      "Télécharger https://github.com/containerd/nerdctl/releases et remplacer nerdctl.exe",
  },
};

const ORAS: ReleasedTool = {
  create: () => new OrasProvider(),
  id: "oras",
  name: "ORAS",
  binary: "oras",
  probe: {
    argv: ["oras", "version"],
    stdout: "Version:        1.1.0\nGo version:     go1.22.3\nGit commit:     dc8d5ae",
  },
  current: "1.1.0",
  release: githubLatest("oras-project/oras", "v1.2.2"),
  latest: "1.2.2",
  upToDate: githubLatest("oras-project/oras", "v1.1.0"),
  delegation: {
    ids: { scoop: "oras", choco: "oras", winget: "oras-project.oras", brew: "oras" },
    manualMessage: "Télécharger https://github.com/oras-project/oras/releases et remplacer oras.exe",
  },
};

// --- desktop apps ---------------------------------------------------------------

export const POWERSHELL = "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe";
const POWERSHELL_PREFIX = ["powershell", "-NoProfile", "-NonInteractive", "-Command"];

/** Docker Desktop's probe: the exe path travels in the environment, never in the script. */
export const DOCKER_VERSION_ARGV = [
  ...POWERSHELL_PREFIX,
  "$ErrorActionPreference = 'Stop'; (Get-Item -LiteralPath $env:GUP_DOCKER_DESKTOP_EXE).VersionInfo.ProductVersion",
];

/** Podman's and Rancher's probe: the exe path single-quoted into the script. */
export function versionInfoArgv(exe: string): string[] {
  const literal = exe.replace(/'/g, "''");
  return [...POWERSHELL_PREFIX, `(Get-Item -LiteralPath '${literal}').VersionInfo.ProductVersion`];
}

/** Where each app installs: per-user first when it has a per-user install, then Program Files. */
export const DESKTOP_EXES = {
  docker: "C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe",
  dockerX86: "C:\\Program Files (x86)\\Docker\\Docker\\Docker Desktop.exe",
  podman: `${WIN_HOME}\\AppData\\Local\\Programs\\podman-desktop\\Podman Desktop.exe`,
  podmanMachineWide: "C:\\Program Files\\Podman Desktop\\Podman Desktop.exe",
  rancher: `${WIN_HOME}\\AppData\\Local\\Programs\\Rancher Desktop\\Rancher Desktop.exe`,
  rancherMachineWide: "C:\\Program Files\\Rancher Desktop\\Rancher Desktop.exe",
} as const;

export interface DesktopMachine {
  readonly exe: string;
  /** The version probe, and what it prints. */
  readonly probe: readonly string[];
  readonly version: CommandAnswer;
  readonly release: HttpRoute;
}

/** Windows with the app's exe at `exe` and PowerShell on PATH. */
export function desktopMachine(machine: DesktopMachine): SystemSpec {
  return {
    platform: "win32",
    bin: { powershell: POWERSHELL },
    fs: { [machine.exe]: { kind: "file", executable: true } },
    commands: [{ argv: machine.probe, ...machine.version }],
    http: [machine.release],
  };
}

/** Docker publishes its Windows releases in docker/for-win, read directly. */
export function dockerRelease(json: unknown): HttpRoute {
  return { url: "https://api.github.com/repos/docker/for-win/releases/latest", json };
}

export function dockerMachine(version: string, release: HttpRoute): SystemSpec {
  return desktopMachine({
    exe: DESKTOP_EXES.docker,
    probe: DOCKER_VERSION_ARGV,
    version: { stdout: version },
    release,
  });
}

interface DesktopApp {
  readonly create: () => Provider;
  readonly id: string;
  readonly name: string;
  /** The machine behind the latest release, and up to date. */
  readonly behind: SystemSpec;
  readonly upToDate: SystemSpec;
  readonly current: string;
  readonly latest: string;
  readonly message: string;
}

/**
 * The app's own updater does the work: a manual row, and one skipped outcome
 * pointing at the GUI whatever the rows (and whether anything is behind).
 */
function desktopAppCases(app: DesktopApp): ProviderContractCase[] {
  const skipped = { success: false, skipped: true, message: app.message };
  const update = { packageId: app.id, installs: [], outcome: skipped };
  const row = { id: app.id, name: app.name, current: app.current, latest: app.latest };
  return [
    {
      create: app.create,
      system: app.behind,
      outdated: [{ ...row, note: "GUI updater", manual: true }],
      update,
      updateAll: "collapsed",
    },
    {
      scenario: "up to date",
      create: app.create,
      system: app.upToDate,
      outdated: [],
      update,
      updateAll: "collapsed",
    },
  ];
}

const DOCKER_DESKTOP: DesktopApp = {
  create: () => new DockerDesktopProvider(),
  id: "docker-desktop",
  name: "Docker Desktop",
  // The file version has a fourth, build component the release feed does not.
  behind: dockerMachine("4.34.2.167585", dockerRelease({ tag_name: "v4.35.0" })),
  upToDate: dockerMachine("4.34.2.167585", dockerRelease({ tag_name: "v4.34.2" })),
  current: "4.34.2",
  latest: "4.35.0",
  message: "Ouvrir Docker Desktop → Settings → Software Updates pour appliquer.",
};

export function podmanMachine(version: string, release: HttpRoute): SystemSpec {
  const exe = DESKTOP_EXES.podman;
  return desktopMachine({ exe, probe: versionInfoArgv(exe), version: { stdout: version }, release });
}

const PODMAN_DESKTOP: DesktopApp = {
  create: () => new PodmanDesktopProvider(),
  id: "podman-desktop",
  name: "Podman Desktop",
  behind: podmanMachine("1.12.0", githubLatest("containers/podman-desktop", "v1.13.0")),
  upToDate: podmanMachine("1.12.0", githubLatest("containers/podman-desktop", "v1.12.0")),
  current: "1.12.0",
  latest: "1.13.0",
  message: "Lancer Podman Desktop → menu → Check for Updates pour appliquer.",
};

export function rancherMachine(version: string, release: HttpRoute): SystemSpec {
  const exe = DESKTOP_EXES.rancher;
  return desktopMachine({ exe, probe: versionInfoArgv(exe), version: { stdout: version }, release });
}

const RANCHER_RELEASES = "rancher-sandbox/rancher-desktop";

const RANCHER_DESKTOP: DesktopApp = {
  create: () => new RancherDesktopProvider(),
  id: "rancher-desktop",
  name: "Rancher Desktop",
  behind: rancherMachine("1.13.0", githubLatest(RANCHER_RELEASES, "v1.14.0")),
  upToDate: rancherMachine("1.13.0", githubLatest(RANCHER_RELEASES, "v1.13.0")),
  current: "1.13.0",
  latest: "1.14.0",
  message: "Lancer Rancher Desktop → Preferences → Check for Updates pour appliquer.",
};

export const containersCases: readonly ProviderContractCase[] = [
  ...[DIVE, NERDCTL, ORAS].flatMap(releasedToolCases),
  ...[DOCKER_DESKTOP, PODMAN_DESKTOP, RANCHER_DESKTOP].flatMap(desktopAppCases),
];
