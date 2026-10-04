# Installation

- [Via npm (recommended)](#via-npm-recommended)
- [npm 11 and install scripts](#npm-11-and-install-scripts)
- [From source](#from-source)
- [Requirements](#requirements)
- [Platform support](#platform-support)
- [Updating gup itself](#updating-gup-itself)
- [Uninstalling](#uninstalling)

## Via npm (recommended)

```bash
npm install -g @charles_lindecker/gup --allow-scripts=node-pty
```

Package: [`@charles_lindecker/gup`](https://www.npmjs.com/package/@charles_lindecker/gup).

The package ships the bundled `gup` CLI and nothing that runs on its own: no service, no
daemon — nothing runs until you run it, or until you create a
[scheduled update](scheduled-updates.md). `--allow-scripts=node-pty` is explained just below; the
plain `npm install -g @charles_lindecker/gup` works too.

## npm 11 and install scripts

gup has one optional native dependency, [node-pty](https://github.com/microsoft/node-pty): the
pseudo-terminal that lets updates started from the interactive app run **inside** it, in a live
terminal pane. node-pty has install scripts (they check for a prebuilt binary, or compile one),
and npm 11 asks you to review install scripts it was not told to trust. A plain install prints:

```text
npm warn install-scripts 1 package has install scripts not yet covered by allowScripts:
npm warn install-scripts   node-pty@1.1.0 (install: node scripts/prebuild.js || node-gyp rebuild; postinstall: node scripts/post-install.js)
```

| You run | What happens |
|---|---|
| `npm i -g @charles_lindecker/gup --allow-scripts=node-pty` | node-pty's scripts run, no warning. Recommended. |
| `npm i -g @charles_lindecker/gup` | npm runs them anyway, with the warning above. |
| npm configured with `strict-allow-scripts=true` | the install **fails** (`ESTRICTALLOWSCRIPTS`) until you add `--allow-scripts=node-pty`. |
| `npm i -g @charles_lindecker/gup --ignore-scripts` | nothing runs. Harmless on Windows and macOS: node-pty ships prebuilt binaries there, and gup restores the macOS helper's exec bit itself. On Linux there is no prebuilt binary, so the embedded terminal is unavailable and updates run outside the app. |

To trust node-pty for every global install, once:
`npm config set allow-scripts=node-pty --location=user`.

Without node-pty — scripts ignored, the optional install skipped, `GUP_PTY=off` — gup works
exactly as it does elsewhere; only an update started from the interactive app leaves the
full-screen view and runs in your terminal, as in gup 0.4. `gup doctor` says which, on its
**Terminal intégré** line (see [Troubleshooting](troubleshooting.md#the-embedded-terminal-is-unavailable)).

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
| **Node** | ≥ 26.9.0 — matches `engines.node`; the interactive app (OpenTUI) loads its native renderer through `node:ffi`, on by default from 26.9 |
| **Shell** | any: PowerShell, cmd, bash, zsh, fish |
| **Terminal** | any for the commands; the interactive app needs a real terminal (stdin and stdout attached to a TTY). Windows Terminal is recommended over the classic console host |
| **OS** | Windows, macOS, Linux |

Scanning never needs elevation. `gup` only asks for it when a selected package genuinely
requires it, and then only once for the whole batch — see
[Elevated updates](cli-reference.md#elevated-updates).

## Platform support

| Platform | Providers available | OS-level providers | Embedded terminal (updates inside the app) |
|---|---:|---|---|
| **Windows** | 139 of 153 | winget, scoop, Chocolatey, MSYS2, Cygwin, Npackd — plus the WSL bridge (apt, dnf, pacman, brew, flatpak, nix inside your distros) | prebuilt (ConPTY) |
| **macOS** | 132 of 153 | Homebrew (formulae and casks), Mac App Store (`mas`), MacPorts, Fink, Sparkle, xcodes, Nix, pkgx, pkgin | prebuilt; gup makes its `spawn-helper` executable when npm left it without the exec bit |
| **Linux** | 126 of 153 | Homebrew/Linuxbrew, Nix, pkgx, pkgin; apt/dnf ownership of binaries under system prefixes (`dpkg -S` / `rpm -qf`) | compiled at install time when a C/C++ toolchain and Python are present; otherwise updates run outside the app |

Everything above the OS layer — npm/pnpm/yarn/bun globals, pip/pipx/uv, cargo, gem, composer, the
cloud/IaC/Kubernetes CLIs, VS Code and JetBrains — works the same everywhere the underlying tool
runs.

Providers that cannot exist on a platform (winget on a Mac, MacPorts on Windows) are never probed,
scanned or updated there: `gup doctor` and the Providers view list them greyed out, in their own
"Incompatibles avec …" group, with the OS they run on. The full per-OS lists are in the
[providers catalog](providers-catalog.md). Run `gup doctor` to see exactly what was detected on the
machine in front of you.

## Updating gup itself

Installed from npm, `gup` is a global npm package like any other — its own `npm-g` provider picks
it up, so it updates itself:

```bash
gup update npm-g:@charles_lindecker/gup
```

Or through npm directly:

```bash
npm install -g @charles_lindecker/gup@latest --allow-scripts=node-pty
```

> The `self` provider is a different thing: it updates the **package managers** `gup` drives
> (winget, scoop, choco, npm, pnpm, yarn, pip, pipx, gh, brew), not `gup` itself.

If you use [scheduled updates](scheduled-updates.md), the OS trigger keeps pointing at the right
gup across updates: it records the real paths of node and gup, and gup repairs it at its next
start when they moved (a Node upgrade, for instance).

## Uninstalling

If you created [scheduled updates](scheduled-updates.md), remove their OS trigger first — npm runs
no uninstall hook for gup, and a trigger left behind keeps starting a `gup` that no longer exists:

```bash
gup schedule uninstall --purge            # the trigger, the schedules and their state
```

Then:

```bash
npm uninstall -g @charles_lindecker/gup   # installed from npm
npm rm -g @charles_lindecker/gup          # installed with `npm link`
```

Already uninstalled? [Remove the trigger by hand](scheduled-updates.md#removing-everything-by-hand).

What gup leaves on disk is all safe to delete:

| What | Windows | macOS | Linux |
|---|---|---|---|
| Settings (`config.json`) | `%APPDATA%\gup` | `~/Library/Application Support/gup` | `$XDG_CONFIG_HOME/gup` (else `~/.config/gup`) |
| Activity history, reports, update lock (`history/`, `reports/`, `locks/`) | `%LOCALAPPDATA%\gup` | `~/Library/Application Support/gup` | `$XDG_STATE_HOME/gup` (else `~/.local/state/gup`) |
| Debug log | `%LOCALAPPDATA%\gup\logs` | `~/Library/Logs/gup` | `$XDG_STATE_HOME/gup/logs` |
| Schedules (if not purged) | `%LOCALAPPDATA%\gup\scheduler` | `~/Library/Application Support/gup/scheduler` | `$XDG_STATE_HOME/gup/scheduler` |

On Windows, add the Nerd Fonts lockfile (`%LOCALAPPDATA%\gup\nerd-fonts.json`) if you ever used
that provider.
