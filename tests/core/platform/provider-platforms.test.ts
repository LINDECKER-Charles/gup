import { afterEach, describe, expect, it, vi } from "vitest";
import { isSupportedOn } from "../../../src/core/platform/is-supported-on.js";
import { PLATFORMS } from "../../../src/core/platform/platforms.js";
import { ALL_PROVIDERS, detectAvailableProviders } from "../../../src/core/registry.js";
import { restorePlatform, setPlatform } from "../../support/platform.js";

/**
 * The user-visible contract of OS compatibility: which registered providers
 * gup refuses on each desktop OS, in registry order. Changing a provider's
 * `platforms` changes one of these lists, so it takes a deliberate edit here.
 */
const INCOMPATIBLE: ReadonlyArray<readonly [NodeJS.Platform, readonly string[]]> = [
  [
    "win32",
    [
      "brew", "brew-cask", "mas", "macports", "sparkle", "fink", "nix", "pkgx", "pkgin",
      "nvm", "pyenv", "mint", "swiftly", "xcodes",
    ],
  ],
  [
    "darwin",
    [
      "winget", "scoop", "choco", "msys2", "cygwin", "npackd",
      "wsl", "wsl-apt", "wsl-dnf", "wsl-pacman", "wsl-brew", "wsl-flatpak", "wsl-nix",
      "nvm-windows", "pyenv-win", "docker-desktop", "podman-desktop", "rancher-desktop",
      "nerd-fonts", "git-for-windows", "visual-studio",
    ],
  ],
  [
    "linux",
    [
      "winget", "scoop", "choco", "msys2", "cygwin", "npackd",
      "brew-cask", "mas", "macports", "sparkle", "fink",
      "wsl", "wsl-apt", "wsl-dnf", "wsl-pacman", "wsl-brew", "wsl-flatpak", "wsl-nix",
      "nvm-windows", "pyenv-win", "docker-desktop", "podman-desktop", "rancher-desktop",
      "xcodes", "nerd-fonts", "git-for-windows", "visual-studio",
    ],
  ],
];

/** Every provider's probe answers "installed", so only the platform gate can say no. */
function everyProbeTrue() {
  return new Map(
    ALL_PROVIDERS.map((p) => [p.id, vi.spyOn(p, "isAvailable").mockResolvedValue(true)]),
  );
}

async function detectedIds(): Promise<string[]> {
  return (await detectAvailableProviders()).map((p) => p.id);
}

afterEach(() => {
  vi.restoreAllMocks();
  restorePlatform();
});

describe("provider platforms: golden sets", () => {
  it.each(INCOMPATIBLE)("refuses exactly the expected providers on %s", (platform, expected) => {
    const refused = ALL_PROVIDERS.filter((p) => !isSupportedOn(p, platform)).map((p) => p.id);
    expect(refused).toEqual(expected);
  });

  it("declares only the named PLATFORMS sets, never an ad-hoc array", () => {
    const namedSets: readonly unknown[] = Object.values(PLATFORMS);
    const adHoc = ALL_PROVIDERS.filter(
      (p) => p.platforms !== undefined && !namedSets.includes(p.platforms),
    );
    expect(adHoc.map((p) => p.id)).toEqual([]);
  });
});

describe("provider platforms: detection", () => {
  it.each(INCOMPATIBLE)("never probes a provider refused on %s", async (platform, refused) => {
    setPlatform(platform);
    const probes = everyProbeTrue();
    const supported = ALL_PROVIDERS.map((p) => p.id).filter((id) => !refused.includes(id));
    expect(await detectedIds()).toEqual(supported);
    for (const id of refused) expect(probes.get(id)).not.toHaveBeenCalled();
  });

  it("gives the shared `pyenv` and `nvm` binaries to the Windows ports on Windows", async () => {
    setPlatform("win32");
    everyProbeTrue();
    const detected = await detectedIds();
    expect(detected).toEqual(expect.arrayContaining(["pyenv-win", "nvm-windows"]));
    expect(detected).not.toContain("pyenv");
    expect(detected).not.toContain("nvm");
  });

  it("gives them to the upstream projects on macOS", async () => {
    setPlatform("darwin");
    everyProbeTrue();
    const detected = await detectedIds();
    expect(detected).toEqual(expect.arrayContaining(["pyenv", "nvm"]));
    expect(detected).not.toContain("pyenv-win");
    expect(detected).not.toContain("nvm-windows");
  });
});
