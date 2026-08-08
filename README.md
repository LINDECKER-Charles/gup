<div align="center">

# `gup` — Global Updater

**One command to scan and update everything installed on your machine.**
winget, scoop, choco, brew, casks, Mac App Store, MacPorts, apt, dnf, npm, pnpm, yarn, bun, pip, pipx, uv, cargo, gem, dotnet tools, helm, kubectl, terraform, vscode extensions, JetBrains, WSL distros…

[**Homepage**](https://lindecker-charles.github.io/gup/) · [**npm**](https://www.npmjs.com/package/@charles_lindecker/gup) · [**Docs**](docs/) · [**Providers (130+)**](docs/providers-catalog.md)

[![CI](https://github.com/LINDECKER-Charles/gup/actions/workflows/ci.yml/badge.svg)](https://github.com/LINDECKER-Charles/gup/actions/workflows/ci.yml)
[![Security](https://github.com/LINDECKER-Charles/gup/actions/workflows/security.yml/badge.svg)](https://github.com/LINDECKER-Charles/gup/actions/workflows/security.yml)
[![Pages](https://github.com/LINDECKER-Charles/gup/actions/workflows/pages.yml/badge.svg)](https://lindecker-charles.github.io/gup/)
[![CodeQL](https://img.shields.io/badge/CodeQL-security--extended-2ea44f?logo=github)](https://github.com/LINDECKER-Charles/gup/actions/workflows/security.yml)
[![Semgrep](https://img.shields.io/badge/semgrep-p%2Ftypescript%20%2B%20p%2Fnodejs-1B4965?logo=semgrep&logoColor=white)](https://github.com/LINDECKER-Charles/gup/actions/workflows/security.yml)
[![Gitleaks](https://img.shields.io/badge/gitleaks-enabled-000?logo=gitleaks)](https://github.com/LINDECKER-Charles/gup/actions/workflows/security.yml)
[![Dependabot](https://img.shields.io/badge/dependabot-weekly-025E8C?logo=dependabot&logoColor=white)](https://github.com/LINDECKER-Charles/gup/blob/main/.github/dependabot.yml)

[![npm](https://img.shields.io/npm/v/@charles_lindecker/gup?logo=npm&color=CB3837)](https://www.npmjs.com/package/@charles_lindecker/gup)
[![npm downloads](https://img.shields.io/npm/dm/@charles_lindecker/gup?logo=npm&color=CB3837&label=downloads)](https://www.npmjs.com/package/@charles_lindecker/gup)
[![Node](https://img.shields.io/badge/node-%E2%89%A522-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/typescript-strict-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vitest](https://img.shields.io/badge/tested%20with-vitest-6E9F18?logo=vitest&logoColor=white)](https://vitest.dev/)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux%20%7C%20WSL-4c6ef5)](#platform-support)
[![Providers](https://img.shields.io/badge/providers-130%2B-brightgreen)](docs/providers-catalog.md)
[![GitHub stars](https://img.shields.io/github/stars/LINDECKER-Charles/gup?style=social)](https://github.com/LINDECKER-Charles/gup/stargazers)

</div>

---

## TL;DR

```bash
npm install -g @charles_lindecker/gup
gup                # interactive menu
gup list --fast    # fast scan
gup update --all   # update everything
```

## Why `gup`

On a dev machine, binaries come from **dozens of sources** (winget, scoop, brew, npm-g, cargo, pipx, dotnet tools, vscode-ext, JetBrains, helm, terraform, kubectl…). No native tool covers them all — `winget upgrade --all` silently skips pinned packages, `brew upgrade` never sees your npm globals or your VS Code extensions, `ncu -g` only sees npm, and every cloud/IaC/K8s CLI ships its own `self-update`. `gup` unifies the whole thing behind a single CLI plus an interactive menu.

## Installation

### Via npm (recommended)

```bash
npm install -g @charles_lindecker/gup
```

Package: [`@charles_lindecker/gup`](https://www.npmjs.com/package/@charles_lindecker/gup) on npm.

### From source

```bash
git clone https://github.com/LINDECKER-Charles/gup.git
cd gup
npm install
npm run build
npm link            # exposes the `gup` command globally
```

Requirements: **Node ≥ 22**, and any shell (PowerShell, bash, zsh, fish).

### Platform support

| Platform | OS-level providers | Status |
|---|---|---|
| **Windows** | winget, scoop, chocolatey | Primary target. Adds the WSL bridge (apt, dnf, pacman, brew, flatpak, nix inside your distros) and the UAC elevation batch. |
| **macOS** | Homebrew (formulae + casks), Mac App Store (`mas`), MacPorts | Binaries installed by brew are detected through their Cellar/Caskroom symlink, so upgrades are delegated back to brew instead of being reported as manual. |
| **Linux** | Homebrew/Linuxbrew, apt, dnf | Ownership of a binary under a system prefix is resolved via `dpkg -S` / `rpm -qf`. |

Everything above the OS layer — npm/pnpm/yarn/bun globals, pip/pipx/uv, cargo,
gem, composer, the cloud/IaC/K8s CLIs, VS Code & JetBrains — is
platform-independent and works the same everywhere the underlying tool runs.
Providers that cannot exist on a platform (winget on a Mac, MacPorts on
Windows) simply report themselves as unavailable and never appear in a scan.

## Usage

```bash
gup                                                  # interactive menu
gup list                                             # list outdated packages
gup list --fast                                      # skip slow scans
gup list --provider winget npm-g                     # restrict
gup list --json                                      # pipeable JSON output
gup update                                           # interactive selection
gup update --all -y                                  # everything (no prompt, CI)
gup update winget:Microsoft.PowerShell npm-g:typescript
gup update --all --timeout 300                       # auto-skip any install stuck > 5 min
gup doctor                                           # detected providers vs missing
```

### Skipping stuck installs

Some installs can hang (a stalled download, the Windows Installer mutex, an
installer that drops its `--silent` flag and waits on a now-visible GUI). gup
won't block forever:

- **Ctrl+C** during a batch skips the install in flight and moves on; **Ctrl+C
  twice** stops the whole batch.
- A per-install **wall-clock timeout** (default 20 min) auto-skips a wedged
  install. Tune it with `--timeout <seconds>` (0 disables), the
  `GUP_INSTALL_TIMEOUT` env var (seconds), or the menu's *Options → Timeout
  install*.

Skipped installs are reported as `SKIP` (not failures) and don't trigger the
retry prompt.

| Command | Effect |
|---|---|
| `gup` | Interactive menu: Review / Update selected / Update all / Update target / Providers / Options |
| `gup list` | Lists outdated packages, colorized table |
| `gup list --fast` | Skips slow scans (pwsh-modules, vscode-ext…) |
| `gup list --json` | Raw JSON output (pipeable) |
| `gup update` | Interactive multi-package selection |
| `gup update --all` | Updates everything (with confirmation) |
| `gup update <provider:pkg>` | Specific targets |
| `gup update --timeout <s>` | Auto-skip any install exceeding `<s>` seconds (0 = off) |
| `gup doctor` | Detected providers + install hints |

### Activity history

Every scan and every update attempt is appended to a local log, so you keep a
record of what was updated, when, from which version to which, and what failed.
Nothing is sent anywhere and nothing is read back — the log never influences
what `gup` does next.

**Where** — one file per month, `YYYY-MM.jsonl`, under:

| Platform | Path |
|---|---|
| Windows | `%LOCALAPPDATA%\gup\history\` |
| macOS | `~/Library/Application Support/gup/history/` |
| Linux / other | `$XDG_STATE_HOME/gup/history/` (default `~/.local/state/gup/history/`) |

**Format** — [JSONL](https://jsonlines.org): one JSON object per line, each
stamped with a schema version (`v`) and a `runId` shared by every record of the
same `gup` invocation.

```jsonc
{"v":1,"ts":"2026-08-08T20:11:04.318Z","runId":"3f2a…","gup":"0.3.1","platform":"win32",
 "kind":"scan","durationMs":8421,"fast":false,"filter":[],"outdated":7,
 "providers":[{"providerId":"winget","outdated":5},{"providerId":"npm-global","outdated":2}]}
{"v":1,"ts":"2026-08-08T20:11:19.902Z","runId":"3f2a…","gup":"0.3.1","platform":"win32",
 "kind":"update","providerId":"npm-global","packageId":"typescript","status":"success",
 "from":"5.9.2","to":"6.0.3","durationMs":14108}
```

`status` is one of `success`, `failed` or `skipped`. Optional fields appear only
when they apply: `message` (failure cause or skip reason), `retry` (the retry
strategy used), `elevated` (applied through the UAC / sudo batch).

**Reading it back:**

```powershell
Get-Content "$env:LOCALAPPDATA\gup\history\2026-08.jsonl" | ConvertFrom-Json |
  Where-Object kind -eq 'update' | Group-Object status
```

```bash
jq -s 'map(select(.kind=="update" and .status=="success")) | length' ~/.local/state/gup/history/*.jsonl
```

**Turning it off / moving it:**

| Variable | Effect |
|---|---|
| `GUP_HISTORY=0` | Disables history entirely (`false`, `off`, `no` also work) |
| `GUP_HISTORY_DIR=<path>` | Writes the shards somewhere else |

A history that cannot be written (full disk, read-only profile) prints one
dimmed warning on stderr and is never fatal to an update.

## Documentation

| Document | Content |
|---|---|
| [`docs/architecture.md`](docs/architecture.md) | Internal architecture: layers, data model, parallel scan, update pipeline, security — with mermaid diagrams. |
| [`docs/how-gup-works.md`](docs/how-gup-works.md) | End-to-end technical walkthrough (motivation, model, internal contracts, resilience, build). |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | Contribution guide: provider-addition workflow, mandatory conventions, edge cases, PR checklist. |
| [`docs/providers-catalog.md`](docs/providers-catalog.md) | Exhaustive catalog of the 130+ providers, implementation status, out-of-scope items. |
| [`SECURITY.md`](SECURITY.md) | Threat model, mitigations, vulnerability reporting. |

## Security

| Layer | Tool |
|---|---|
| **Command injection** | `execa` argv-vector, no `shell: true` (allowlist pinned by tests) |
| **HTTPS only** | every `fetch()` call enforced as `https://` |
| **Static analysis** | CodeQL `security-extended` + `security-and-quality` |
| **SAST** | Semgrep (`.semgrep.yml` + `p/typescript` + `p/nodejs`) |
| **Secrets** | gitleaks |
| **Dependencies** | `audit-ci` + Dependabot (weekly grouped) |
| **Lint** | `eslint-plugin-security` |

```bash
npm run security        # audit + eslint-security + tests/security
```

Reporting: [private security advisory](https://github.com/LINDECKER-Charles/gup/security/advisories/new). See [`SECURITY.md`](SECURITY.md).

## Tests

```bash
npm run typecheck             # tsc strict + noUncheckedIndexedAccess
npm run test:run              # vitest one-shot
npm run test:coverage         # vitest + v8 coverage
npm run test:security         # security suite only
npm run lint                  # eslint
```

Cross-platform CI: **Windows** + **macOS** + **Ubuntu**, Node **22** & **24** — the two LTS lines still under support.

## Out of scope

- **Windows Update OS / drivers** → `PSWindowsUpdate`
- **macOS system updates** (`softwareupdate`, XProtect, Command Line Tools) → same rule as Windows Update: OS releases aren't gup's business
- **Apple's system Ruby** → frozen by Apple under SIP; `gem update` there cannot succeed, so the `gem` provider hides itself when it resolves to `/usr/bin/gem`
- **Maven / Gradle / sbt / bundler / lockfiles** → project-scoped, not global
- **JetBrains Toolbox-managed IDEs** → the Toolbox ships its own updater

## License

[MIT](LICENSE) © Charles Lindecker
