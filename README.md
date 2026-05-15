# gup — GlobalUpdater

CLI TypeScript unifiée pour scanner et mettre à jour les paquets installés via plusieurs gestionnaires.

## Providers supportés

| ID | Source | Méthode |
|---|---|---|
| `winget` | Winget (Microsoft Store + WinGet repo) | `winget upgrade --include-unknown` + parsing colonnaire |
| `npm-g` | npm global | `npm outdated -g --json` |
| `scoop` | Scoop | `scoop status` |
| `choco` | Chocolatey | `choco outdated -r` |
| `pip` | pip (user) | `pip list --outdated --user --format=json` |
| `pipx` | pipx | `pipx list --json` + PyPI API |
| `dotnet-tools` | .NET global tools | `dotnet tool list -g` + NuGet API |
| `cargo` | Cargo (Rust, via `cargo-update`) | `cargo install-update -l` |
| `pwsh-modules` | PSGallery | `Get-InstalledModule` + `Find-Module` |
| `composer-g` | Composer global | `composer global outdated --format=json` |
| `vscode-ext` | VS Code extensions | `code --list-extensions` + Marketplace API |

## Install

```powershell
npm install
npm run build
npm link   # rend `gup` global
```

## Usage

```powershell
gup                              # = gup list
gup list --fast                  # skip pwsh + vscode (plus rapide)
gup list --provider winget npm-g
gup list --json

gup update                       # multi-sélection interactive
gup update --all                 # tout, avec confirmation
gup update --all -y              # tout, sans confirmation
gup update winget:Microsoft.PowerShell npm-g:typescript

gup doctor                       # providers détectés + manquants
```

## Ce que `ncu -g` + `winget upgrade --all` zappent

- Pinned packages winget (silencieusement ignorés)
- Packages winget en version "unknown" (apps avec auto-updater intégré — Chrome, Discord…)
- Tous les autres gestionnaires (scoop, choco, pip, pipx, dotnet tools, cargo, pwsh modules, composer global, extensions VS Code)
- Windows Update OS/drivers (hors scope — utiliser le module `PSWindowsUpdate`)
- JetBrains Toolbox / IDE managés (hors scope — Toolbox a son propre updater)
