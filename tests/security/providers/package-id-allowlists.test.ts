import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchGitHubReleaseLatest,
  fetchGitHubReleaseTagMatching,
} from "../../../src/core/gh-releases.js";
import type { Provider } from "../../../src/core/types.js";
import { PodmanDesktopProvider } from "../../../src/providers/containers/podman-desktop.js";
import { RancherDesktopProvider } from "../../../src/providers/containers/rancher-desktop.js";
import { RPackagesProvider } from "../../../src/providers/lang-other/r-packages.js";
import { isSafeNpackdPackageName, NpackdProvider } from "../../../src/providers/os/npackd.js";
import { ScoopProvider } from "../../../src/providers/os/scoop.js";
import { NerdFontsProvider } from "../../../src/providers/shell/nerd-fonts.js";
import { PsResourceProvider } from "../../../src/providers/shell/psresource.js";
import { PwshModulesProvider } from "../../../src/providers/shell/pwsh-modules.js";
import { system } from "../../support/system/fake-system.js";
import { githubLatest } from "../../support/system/releases.js";
import { installArgvs, installs } from "../../support/system/trace.js";
import { desktopMachine, versionInfoArgv } from "../../providers/containers/containers.cases.js";
import { rMachine } from "../../providers/lang-other/lang-other.cases.js";
import { SCOOP_MACHINE } from "../../providers/os/windows.cases.js";
import { psResourceMachine, updateResourceArgv } from "../../providers/shell/psresource.cases.js";
import {
  familyZip,
  fontsMachine,
  NERD_FONTS_RELEASE,
  powerShellMachine,
  updateModuleArgv,
} from "../../providers/shell/shell.cases.js";

/**
 * Every place a package id, a font family, a release slug or a path is
 * spliced into something another program parses — a shell, R code, a
 * PowerShell literal, NpackdCL's options, a URL. Each one is checked against
 * an allowlist before anything runs, or escaped the way its parser expects.
 * The providers run for real on the fake machine: what is asserted is what
 * reaches the process or the network.
 */

describe("scoop: the one shell-routed install", () => {
  it("refuses an id outside scoop's charset before any shell sees it", async () => {
    await system.load(SCOOP_MACHINE);
    for (const id of ["gh & calc", "gh;rm", "$(calc)", "a/b/c", ""]) {
      await expect(new ScoopProvider().update(id)).resolves.toEqual({
        id,
        success: false,
        message: `Identifiant de paquet Scoop invalide : ${id}`,
      });
    }
    expect(installs()).toEqual([]);
  });
});

describe("Npackd: names reach NpackdCL's option parser", () => {
  const INVALID_ID_MESSAGE =
    "Nom de paquet Npackd invalide (espace, « .. », tiret initial ou caractère de contrôle) — mise à jour à lancer à la main.";

  it("accepts a real reverse-domain Npackd id", () => {
    expect(isSafeNpackdPackageName("com.googlecode.windirstat.WinDirStat")).toBe(true);
    expect(isSafeNpackdPackageName("org.7-zip.SevenZIP64")).toBe(true);
  });

  it.each([
    ["an empty name", ""],
    ["a leading dash, read as an option", "--version"],
    ["a single-dash option", "-x"],
    ["'..', as Package::isValidName refuses it", "com..example"],
    ["'..' alone", ".."],
    ["a space", "com.example App"],
    ["a tab", "com.example\tApp"],
    ["a newline", "com.example\nApp"],
    ["a NUL", "com.example\u0000App"],
    ["a DEL", "com.example\u007fApp"],
  ])("refuses %s", (_label, name) => {
    expect(isSafeNpackdPackageName(name)).toBe(false);
  });

  it("refuses an unsafe id before even resolving the binary", async () => {
    // No NpackdCL here: a later check would have answered "introuvable" instead.
    await system.load({ platform: "win32", elevated: true });
    await expect(new NpackdProvider().update("--version")).resolves.toEqual({
      id: "--version",
      success: false,
      skipped: true,
      message: INVALID_ID_MESSAGE,
    });
  });
});

describe("R: the package name is spliced into R code", () => {
  it("refuses an id outside the CRAN name allowlist without running R", async () => {
    await system.load(rMachine(""));
    for (const id of ["d'angerous", "pkg); system('id'); (", "1startsWithDigit", ""]) {
      await expect(new RPackagesProvider().update(id)).resolves.toEqual({ id, success: false });
    }
    expect(installArgvs()).toEqual([]);
  });
});

describe("Nerd Fonts: the family names a download and a directory", () => {
  beforeEach(() => {
    // The update prints its download and install lines on the terminal.
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("refuses a family name that could leave the release or the fonts directory", async () => {
    await system.load(fontsMachine({}));
    await expect(new NerdFontsProvider().update("../etc/passwd")).resolves.toEqual({
      id: "../etc/passwd",
      success: false,
      message: 'Nom de famille invalide: "../etc/passwd"',
    });
    expect(system.trace.requests).toEqual([]);
  });

  it("doubles an apostrophe of the user's font path in the PowerShell literal", async () => {
    const local = "C:\\Users\\o'brien\\AppData\\Local";
    const zip = familyZip("FiraCode", { "FiraCodeNerdFont-Regular.ttf": "ttf" });
    const release = { http: [NERD_FONTS_RELEASE, zip] };
    await system.load({ ...fontsMachine(release), env: { LOCALAPPDATA: local } });
    await expect(new NerdFontsProvider().update("FiraCode")).resolves.toEqual({
      id: "FiraCode",
      success: true,
    });
    const [registration] = installArgvs();
    expect(registration?.at(-1)).toContain(
      "-Value 'C:\\Users\\o''brien\\AppData\\Local\\Microsoft\\Windows\\Fonts\\" +
        "FiraCodeNerdFont-Regular.ttf' -Force",
    );
  });
});

/** The desktop apps whose exe path is spliced into a PowerShell script. */
const DESKTOP_APPS: ReadonlyArray<{
  readonly name: string;
  readonly create: () => Provider;
  /** Under the user's `Programs` folder. */
  readonly install: string;
  /** The GitHub repository it publishes its releases in. */
  readonly releases: string;
}> = [
  {
    name: "Podman Desktop",
    create: () => new PodmanDesktopProvider(),
    install: "podman-desktop\\Podman Desktop.exe",
    releases: "containers/podman-desktop",
  },
  {
    name: "Rancher Desktop",
    create: () => new RancherDesktopProvider(),
    install: "Rancher Desktop\\Rancher Desktop.exe",
    releases: "rancher-sandbox/rancher-desktop",
  },
];

describe("PowerShell literals double a single quote", () => {
  it("in a PSResourceGet resource name", async () => {
    await system.load(psResourceMachine({ shell: "powershell" }));
    await new PsResourceProvider().update("Foo'Bar");
    expect(installArgvs()).toEqual([updateResourceArgv("powershell", "Foo''Bar")]);
  });

  it("in a PowerShell module name", async () => {
    await system.load(powerShellMachine("pwsh", "[]"));
    await expect(new PwshModulesProvider().update("Foo'Bar")).resolves.toEqual({
      id: "Foo'Bar",
      success: true,
    });
    expect(installArgvs()).toEqual([updateModuleArgv("pwsh", "Foo''Bar")]);
  });

  it.each(DESKTOP_APPS)("in $name's exe path, read for its version", async (app) => {
    const home = "C:\\Users\\O'Brien";
    const exe = `${home}\\AppData\\Local\\Programs\\${app.install}`;
    const machine = desktopMachine({
      exe,
      probe: versionInfoArgv(exe),
      version: { stdout: "1.12.0" },
      release: githubLatest(app.releases, "v1.13.0"),
    });
    await system.load({ ...machine, env: { LOCALAPPDATA: `${home}\\AppData\\Local` } });
    await expect(app.create().listOutdated()).resolves.toHaveLength(1);
    expect(system.trace.spawns[0]?.argv.at(-1)).toContain("'C:\\Users\\O''Brien\\");
  });
});

describe("GitHub release lookups: the slug becomes a URL path", () => {
  const NOT_A_SLUG = [
    "owner/repo/../../other",
    "owner/repo?ref=main",
    "owner",
    "https://api.github.com/repos/owner/repo",
    "",
  ];

  it.each(NOT_A_SLUG)("asks nothing for the latest release of %j", async (slug) => {
    await expect(fetchGitHubReleaseLatest(slug)).resolves.toBeNull();
    expect(system.trace.requests).toEqual([]);
  });

  it.each(NOT_A_SLUG)("asks nothing for the releases of %j", async (slug) => {
    await expect(fetchGitHubReleaseTagMatching(slug, () => true)).resolves.toBeNull();
    expect(system.trace.requests).toEqual([]);
  });
});
