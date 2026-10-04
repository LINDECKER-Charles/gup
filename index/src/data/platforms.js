/**
 * Per-OS coverage cards and the cross-platform chips (section 02). Names only:
 * badges and footnotes are copy, they live in the catalogs under
 * `coverage.platforms.<id>`.
 *
 * ACCURACY NOTE — checked against the registry (src/providers/os/):
 *
 *   - `brew` and `nix` declare `PLATFORMS.notWindows`: Linuxbrew and native
 *     Nix (Nix itself and the user profile) run on Linux as on macOS. So do
 *     `pkgx` and `pkgin`, left off the cards as niche.
 *   - `apt` and `dnf` are `InstallSource` delegation targets
 *     (src/core/install-source.ts), not providers: they upgrade one detected
 *     binary whose owner `dpkg -S` / `rpm -qf` resolved. gup never runs a
 *     distro-wide upgrade on a native Linux host — hence `isDelegated`.
 *   - pacman and Flatpak exist only as `wsl-*` providers, declared
 *     `PLATFORMS.windows`: they belong to the Windows card's WSL bridge, never
 *     to the Linux card.
 *
 * The cards name each system's main managers, not all of them. How many
 * providers each system supports is derived from the declarations
 * (`providersBySystem` in facts.js).
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
      managers: [
        manager("Homebrew / Linuxbrew"),
        manager("Nix"),
        delegated("apt"),
        delegated("dnf"),
      ],
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
