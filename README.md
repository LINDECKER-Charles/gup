<div align="center">

# `gup` — Global Updater

**One command to scan and update everything installed on your machine.**

[**Homepage**](https://lindecker-charles.github.io/gup/) · [**Documentation**](docs/) · [**Providers (134)**](docs/providers-catalog.md) · [**npm**](https://www.npmjs.com/package/@charles_lindecker/gup)

[![npm](https://img.shields.io/npm/v/@charles_lindecker/gup?logo=npm&color=CB3837)](https://www.npmjs.com/package/@charles_lindecker/gup)
[![npm downloads](https://img.shields.io/npm/dm/@charles_lindecker/gup?logo=npm&color=CB3837&label=downloads)](https://www.npmjs.com/package/@charles_lindecker/gup)
[![CI](https://github.com/LINDECKER-Charles/gup/actions/workflows/ci.yml/badge.svg)](https://github.com/LINDECKER-Charles/gup/actions/workflows/ci.yml)
[![Node](https://img.shields.io/badge/node-%E2%89%A522-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux%20%7C%20WSL-4c6ef5)](docs/installation.md#platform-support)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

<img src="https://raw.githubusercontent.com/LINDECKER-Charles/gup/main/docs/assets/demo.svg" alt="Terminal running gup list --fast: 12 providers scanned in 5.7 seconds, 6 outdated packages listed" width="692">

<sub>winget · scoop · choco · brew · casks · Mac App Store · MacPorts · apt · dnf · npm · pnpm · yarn · bun · pip · pipx · uv · cargo · gem · composer · dotnet tools · helm · kubectl · terraform · VS Code · JetBrains · WSL distros — **134 providers**</sub>

</div>

---

On a dev machine, binaries come from dozens of sources and no native tool
covers them all: `winget upgrade --all` silently skips pinned packages,
`brew upgrade` never sees your npm globals or your VS Code extensions, `ncu -g`
only sees npm, and every cloud CLI ships its own `self-update`. `gup` unifies
the whole thing behind one CLI and an interactive menu.
[Why, and what's deliberately out of scope →](docs/scope.md)

## Install

```bash
npm install -g @charles_lindecker/gup
```

Node ≥ 22 · Windows, macOS, Linux, WSL. [Other install methods →](docs/installation.md)

## Use

```bash
gup                # interactive menu
gup list --fast    # what's outdated, fast scan
gup update --all   # update everything
```

| Command | Effect |
|---|---|
| `gup` | Interactive menu: review, select, update, providers, options |
| `gup list` | Lists outdated packages as a table |
| `gup list --fast` | Skips the slow scans (editor extensions, WSL, pwsh modules…) |
| `gup list --json` | Raw JSON, pipeable |
| `gup update` | Interactive multi-package selection |
| `gup update --all` | Everything, after confirmation (`-y` to skip it) |
| `gup update winget:Spotify.Spotify npm-g:typescript` | Specific targets |
| `gup doctor` | Detected providers, plus install hints for the rest |

Every flag, the retry strategies, the stuck-install timeout, exit codes and the
JSON schema: [**CLI reference →**](docs/cli-reference.md)

## Documentation

| Document | What's in it |
|---|---|
| [Installation](docs/installation.md) | Install methods, requirements, per-platform support |
| [CLI reference](docs/cli-reference.md) | Every command, flag, environment variable, exit code |
| [Scope](docs/scope.md) | What `gup` covers — and what it deliberately doesn't |
| [Providers catalog](docs/providers-catalog.md) | The 134 providers, their status, and what's next |
| [Architecture](docs/architecture.md) | Layers, data model, parallel scan, update pipeline |
| [How `gup` works](docs/how-gup-works.md) | End-to-end technical walkthrough |
| [Contributing](CONTRIBUTING.md) | Adding a provider, conventions, PR checklist |
| [Security](SECURITY.md) | Threat model, mitigations, reporting a vulnerability |

## Credits

Built and maintained by [Charles Lindecker](https://github.com/LINDECKER-Charles),
under the [MIT license](LICENSE).

If `gup` saves you time: [☕ Ko-fi](https://ko-fi.com/charleslindecker) ·
[GitHub Sponsors](https://github.com/sponsors/LINDECKER-Charles) ·
or [a star](https://github.com/LINDECKER-Charles/gup/stargazers).
