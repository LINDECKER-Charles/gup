/**
 * Per-OS coverage cards and the cross-platform chips (section 02). Names only:
 * badges and footnotes are copy, they live in the catalogs under
 * `coverage.platforms.<id>`.
 *
 * ACCURACY NOTE — checked against the registry, only one OS-level provider
 * runs natively on Linux:
 *
 *   - `brew` (src/providers/os/brew.ts) declares `PLATFORMS.notWindows`, so
 *     it covers Linuxbrew; it only excludes win32.
 *   - `apt` and `dnf` are `InstallSource` delegation targets
 *     (src/core/install-source.ts), not providers: they upgrade one detected
 *     binary whose owner `dpkg -S` / `rpm -qf` resolved. gup never runs a
 *     distro-wide upgrade on a native Linux host — hence `isDelegated`.
 *   - pacman, Flatpak and Nix exist only as `wsl-*` providers, declared
 *     `PLATFORMS.windows`: they belong to the Windows card's WSL bridge, never
 *     to the Linux card.
 *
 * How many providers each system supports is not here: it is derived from
 * those declarations (`providersBySystem` in facts.js).
 */

const manager = (name) => Object.freeze({ name, isDelegated: false });
const delegated = (name) => Object.freeze({ name, isDelegated: true });

export const PLATFORMS = Object.freeze({
  systems: Object.freeze([
    {
      id: "windows",
      name: "Windows",
      managers: [manager("winget"), manager("scoop"), manager("chocolatey"), manager("WSL")],
    },
    {
      id: "macos",
      name: "macOS",
      managers: [
        manager("Homebrew"),
        manager("Homebrew Casks"),
        manager("MacPorts"),
        manager("Mac App Store"),
      ],
    },
    {
      id: "linux",
      name: "Linux",
      managers: [manager("Homebrew / Linuxbrew"), delegated("apt"), delegated("dnf")],
    },
  ]),
  /** Everything above the OS layer: identical on the three systems. */
  crossPlatform: Object.freeze([
    "npm",
    "pnpm",
    "yarn",
    "bun",
    "pip",
    "pipx",
    "uv",
    "cargo",
    "rustup",
    "gem",
    "composer",
    "dotnet tools",
    "helm",
    "kubectl",
    "terraform",
    "VS Code",
    "JetBrains",
    "gh extensions",
    "pwsh modules",
    "asdf",
    "mise",
  ]),
});
