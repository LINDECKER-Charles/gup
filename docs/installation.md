# Installation

- [Via npm (recommended)](#via-npm-recommended)
- [From source](#from-source)
- [Requirements](#requirements)
- [Platform support](#platform-support)
- [Updating gup itself](#updating-gup-itself)
- [Uninstalling](#uninstalling)

## Via npm (recommended)

```bash
npm install -g @charles_lindecker/gup
```

Package: [`@charles_lindecker/gup`](https://www.npmjs.com/package/@charles_lindecker/gup).

The package ships a single bundled `gup` binary. No post-install script, no
service, no daemon — nothing runs until you run it.

## From source

```bash
git clone https://github.com/LINDECKER-Charles/gup.git
cd gup
npm install
npm run build
npm link            # exposes the `gup` command globally
```

To iterate without rebuilding, run the TypeScript sources directly:

```bash
npm run dev -- list --fast
```

## Requirements

| | |
|---|---|
| **Node** | ≥ 24.11.0 — matches `engines.node`, the current LTS floor |
| **Shell** | any: PowerShell, cmd, bash, zsh, fish |
| **OS** | Windows, macOS, Linux |

Scanning never needs elevation. `gup` only asks for it when a selected package
genuinely requires it, and then only once for the whole batch — see
[Elevated updates](cli-reference.md#elevated-updates).

## Platform support

| Platform | OS-level providers | Status |
|---|---|---|
| **Windows** | winget, scoop, chocolatey | Primary target. Adds the WSL bridge (apt, dnf, pacman, brew, flatpak, nix inside your distros) and the UAC elevation batch. |
| **macOS** | Homebrew (formulae + casks), Mac App Store (`mas`), MacPorts | Binaries installed by brew are detected through their Cellar/Caskroom symlink, so upgrades are delegated back to brew instead of being reported as manual. |
| **Linux** | Homebrew/Linuxbrew, apt, dnf | Ownership of a binary under a system prefix is resolved via `dpkg -S` / `rpm -qf`. |

Everything above the OS layer — npm/pnpm/yarn/bun globals, pip/pipx/uv, cargo,
gem, composer, the cloud/IaC/K8s CLIs, VS Code & JetBrains — is
platform-independent and works the same everywhere the underlying tool runs.

Providers that cannot exist on a platform (winget on a Mac, MacPorts on
Windows) report themselves as unavailable and never appear in a scan. Run
`gup doctor` to see exactly what was detected on the machine in front of you.

## Updating gup itself

Installed from npm, `gup` is a global npm package like any other — its own
`npm-g` provider picks it up, so it updates itself:

```bash
gup update npm-g:@charles_lindecker/gup
```

Or through npm directly:

```bash
npm install -g @charles_lindecker/gup@latest
```

> The `self` provider is a different thing: it updates the **package managers**
> `gup` drives (winget, scoop, choco, npm, pnpm, yarn, pip, pipx, gh, brew),
> not `gup` itself.

## Uninstalling

```bash
npm uninstall -g @charles_lindecker/gup   # installed from npm
npm rm -g @charles_lindecker/gup          # installed with `npm link`
```

Two things are left behind on disk, both under your platform's local state
directory and both safe to delete:

- the [activity history](cli-reference.md#activity-history) (`gup/history/`);
- the Nerd Fonts lockfile (`gup/nerd-fonts.json`), if you ever used that
  provider.
