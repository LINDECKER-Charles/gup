# Installation

- [Via npm (recommended)](#via-npm-recommended)
- [Choosing the language](#choosing-the-language)
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
[scheduled update](scheduled-updates.md). `--allow-scripts=node-pty` is explained
[below](#npm-11-and-install-scripts); the plain `npm install -g @charles_lindecker/gup` works too.

## Choosing the language

gup speaks English by default, and French. To have it in French from the start, chain the
language to the install command:

```bash
npm install -g @charles_lindecker/gup --allow-scripts=node-pty && gup language fr
```

`&&` runs `gup language fr` once npm has succeeded, in cmd, bash, zsh, fish and PowerShell 7.
Windows PowerShell 5.1 has no `&&`: run the two commands one after the other. Never join them with
`;` — cmd would hand `gup`, `language` and `fr` to npm, as more packages to install.

The choice is saved in gup's [settings file](configuration.md#interface-language), outside the
package, so it outlives every update of gup. `gup language en` goes back to English, `gup language`
says which language is in use, and `GUP_LANG=fr` speaks French in one shell only. It cannot be an
npm option instead: npm 12 refuses options it does not know (`EUNKNOWNCONFIG`) and blocks a
global package's own install scripts, so nothing in the package would ever read one.

## npm 11 and install scripts

gup has one optional native dependency, [node-pty](https://github.com/microsoft/node-pty): the
pseudo-terminal that lets updates started from the interactive app run **inside** it, in a live
terminal pane. node-pty has install scripts (they check for a prebuilt binary, or compile one),
and npm 11 and later ask you to review install scripts they were not told to trust. A plain
install with npm 11 prints:

```text
npm warn install-scripts 1 package has install scripts not yet covered by allowScripts:
npm warn install-scripts   node-pty@1.1.0 (install: node scripts/prebuild.js || node-gyp rebuild; postinstall: node scripts/post-install.js)
```

npm 12 prints `1 package had install scripts blocked because they are not covered by allowScripts:`
instead, and does what it says.

| You run | What happens |
|---|---|
| `npm i -g @charles_lindecker/gup --allow-scripts=node-pty` | node-pty's scripts run, no warning. Recommended. |
| `npm i -g @charles_lindecker/gup` | npm 11 runs them anyway, with the warning above. npm 12 skips them, with its own warning: the same result as `--ignore-scripts` below. |
| npm configured with `strict-allow-scripts=true` | the install **fails** (`ESTRICTALLOWSCRIPTS`) until you add `--allow-scripts=node-pty`. |
| `npm i -g @charles_lindecker/gup --ignore-scripts` | nothing runs. Harmless on Windows and macOS: node-pty ships prebuilt binaries there, and gup restores the macOS helper's exec bit itself. On Linux there is no prebuilt binary, so the embedded terminal is unavailable and updates run outside the app. |

To trust node-pty for every global install, once:
`npm config set allow-scripts=node-pty --location=user`.

Without node-pty — scripts ignored, the optional install skipped, `GUP_PTY=off` — gup works
exactly as it does elsewhere; only an update started from the interactive app leaves the
full-screen view and runs in your terminal, as before 0.5.0. `gup doctor` says which, on its
**Embedded terminal** line (see [Troubleshooting](troubleshooting.md#the-embedded-terminal-is-unavailable)).

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
| **Node** | ≥ 26.9.0, checked when gup starts ([below](#on-an-older-node)); the interactive app (OpenTUI) loads its native renderer through `node:ffi`, on by default from 26.9 |
| **Shell** | any: PowerShell, cmd, bash, zsh, fish |
| **Terminal** | any for the commands; the interactive app needs a real terminal (stdin and stdout attached to a TTY). Windows Terminal is recommended over the classic console host |
| **OS** | Windows, macOS, Linux |

### On an older Node

npm installs gup on any Node from 20, then gup stops at start with the version you have, a link
to [nodejs.org's download page](https://nodejs.org/en/download) and the line that reinstalls gup
once Node is upgraded ([troubleshooting](troubleshooting.md#gup-needs-node-269)).

That is on purpose: `package.json` declares `engines.node >=20`, below the Node gup needs. Asked
for a package without a version, npm installs the newest release whose `engines` accepts the
running Node, and says nothing about the newer ones it skipped. With `engines` at 26.9, Node 22.13
to 26.8 silently got gup 0.3.2, the last release that accepted them (Node 20 to 22.12, 0.2.2), and
`npm install -g` kept reinstalling it. Accepting every Node an older release accepted keeps npm on the latest release,
and lets gup say what to do.

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
"Incompatible with …" group, with the OS they run on. The full per-OS lists are in the
[providers catalog](providers-catalog.md). Run `gup doctor` to see exactly what was detected on the
machine in front of you.

## Updating gup itself

Installed from npm, `gup` is a global npm package like any other: its own `npm-g` provider lists
it as `npm-g:@charles_lindecker/gup` when a newer version is out.

**macOS and Linux:** gup updates itself like any other package — check its row in **Packages**,
or:

```bash
gup update npm-g:@charles_lindecker/gup
```

**Windows: quit gup first.** A running gup keeps its native modules loaded — OpenTUI's
renderer, node-pty's ConPTY — and Windows does not replace a DLL that is loaded: an
`npm install -g` started from inside gup would fail half way and could leave the package
broken. So on Windows gup leaves its own update for after it exits. Its row in **Packages** is
listed but cannot be checked, `gup update npm-g:@charles_lindecker/gup` — or a schedule naming
it — ends as a skip that gives the command to run instead, and the app prints that command when
you quit. Once gup has exited, from any terminal:

```bash
npm install -g @charles_lindecker/gup@latest --allow-scripts=node-pty
```

The same command updates gup on every system.

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
