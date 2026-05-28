<div align="center">

# `gup` — Global Updater

**One command to scan and update everything installed on your machine.**
winget, scoop, choco, npm, pnpm, yarn, bun, pip, pipx, uv, cargo, gem, dotnet tools, helm, kubectl, terraform, vscode extensions, JetBrains, WSL distros…

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
[![Node](https://img.shields.io/badge/node-%E2%89%A520-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/typescript-strict-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vitest](https://img.shields.io/badge/tested%20with-vitest-6E9F18?logo=vitest&logoColor=white)](https://vitest.dev/)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20WSL-0078D6?logo=windows)](https://learn.microsoft.com/windows/wsl/)
[![Providers](https://img.shields.io/badge/providers-130%2B-brightgreen)](docs/providers-catalog.md)
[![GitHub stars](https://img.shields.io/github/stars/LINDECKER-Charles/gup?style=social)](https://github.com/LINDECKER-Charles/gup/stargazers)

</div>

---

## TL;DR

```powershell
npm install -g @charles_lindecker/gup
gup                # interactive menu
gup list --fast    # fast scan
gup update --all   # update everything
```

## Why `gup`

On a dev machine, binaries come from **dozens of sources** (winget, scoop, npm-g, cargo, pipx, dotnet tools, vscode-ext, JetBrains, helm, terraform, kubectl…). No native tool covers them all — `winget upgrade --all` silently skips pinned packages, `ncu -g` only sees npm, and every cloud/IaC/K8s CLI ships its own `self-update`. `gup` unifies the whole thing behind a single CLI plus an interactive menu.

## Installation

### Via npm (recommended)

```powershell
npm install -g @charles_lindecker/gup
```

Package: [`@charles_lindecker/gup`](https://www.npmjs.com/package/@charles_lindecker/gup) on npm.

### From source

```powershell
git clone https://github.com/LINDECKER-Charles/gup.git
cd gup
npm install
npm run build
npm link            # exposes the `gup` command globally
```

Requirements: **Node ≥ 20**, PowerShell or Bash. Works on Windows / WSL / Linux.

## Usage

```powershell
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

```powershell
npm run security        # audit + eslint-security + tests/security
```

Reporting: [private security advisory](https://github.com/LINDECKER-Charles/gup/security/advisories/new). See [`SECURITY.md`](SECURITY.md).

## Tests

```powershell
npm run typecheck             # tsc strict + noUncheckedIndexedAccess
npm run test:run              # vitest one-shot
npm run test:coverage         # vitest + v8 coverage
npm run test:security         # security suite only
npm run lint                  # eslint
```

Cross-platform CI: **Ubuntu** + **Windows**, Node **20** & **22**.

## Out of scope

- **Windows Update OS / drivers** → `PSWindowsUpdate`
- **Maven / Gradle / sbt / bundler / lockfiles** → project-scoped, not global
- **JetBrains Toolbox-managed IDEs** → the Toolbox ships its own updater

## License

[MIT](LICENSE) © Charles Lindecker
