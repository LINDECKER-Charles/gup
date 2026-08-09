/**
 * Platform support, section 02.
 *
 * ACCURACY NOTE — the source design shipped a Linux card listing
 * "apt, dnf, pacman, Flatpak, Nix, Homebrew" under the headline "macOS et
 * Linux, en natif". Checked against the registry, only one of those six is
 * true on a native Linux host:
 *
 *   - `brew` (src/providers/os/brew.ts) is the sole OS-level provider that
 *     runs natively on Linux — it is deliberately not darwin-gated so it
 *     covers Linuxbrew, and only excludes win32.
 *   - `apt` and `dnf` are `InstallSource` delegation targets
 *     (src/core/install-source.ts), not providers. They upgrade one already
 *     detected binary whose ownership `dpkg -S` / `rpm -qf` resolved. gup
 *     never runs a distro-wide upgrade on a native Linux host.
 *   - pacman, Flatpak and Nix exist only as `wsl-*` providers, whose
 *     isAvailable() goes through isWslAvailable() — hard-gated on
 *     `process.platform === "win32"` (src/core/wsl.ts). They are unreachable
 *     off Windows by construction.
 *
 * The cards below say what the code does. The visual design is unchanged.
 */

export const platforms = {
  label: "02 / PLATEFORMES",
  flag: "NOUVEAU",
  title: ["Trois systèmes.", "Un seul binaire."],
  lead: "Le même exécutable sur Windows, macOS et Linux — même contrat de provider, même sortie JSON. Ce qui change d'un système à l'autre, c'est la couche OS que gup sait piloter.",
  cards: [
    {
      name: "Windows",
      badge: "CIBLE HISTORIQUE",
      isNew: false,
      icon: "windows",
      managers: ["winget", "scoop", "chocolatey", "noyau WSL"],
      foot: "Pont WSL : apt, dnf, pacman, Flatpak, Nix et Linuxbrew dans tes distros",
    },
    {
      name: "macOS",
      badge: "NATIF",
      isNew: true,
      icon: "macos",
      managers: ["Homebrew", "Casks", "MacPorts", "Mac App Store"],
      foot: "Apple Silicon et Intel · mas-cli optionnel · résolution des symlinks du Cellar",
    },
    {
      name: "Linux",
      badge: "NATIF",
      isNew: true,
      icon: "linux",
      managers: ["Homebrew / Linuxbrew", "apt · délégation", "dnf · délégation"],
      foot: "Ownership d'un binaire résolue par dpkg -S / rpm -qf, puis mise à jour rendue à son gestionnaire",
    },
  ],
  /**
   * Everything above the OS layer, identical on the three systems. These are
   * the providers that make the "same binary everywhere" claim real.
   */
  crossPlatform: [
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
  ],
  banner: {
    title: "Ton Mac, ton serveur, ta tour Windows.",
    cta: "Installer",
  },
};
