<div align="center">

# `gup` — Global Updater

**Une seule commande pour scanner et mettre à jour tout ce qui est installé sur ta machine.**
winget, scoop, choco, npm, pnpm, yarn, bun, pip, pipx, uv, cargo, gem, dotnet tools, helm, kubectl, terraform, vscode extensions, JetBrains, WSL distros…

[![CI](https://github.com/LINDECKER-Charles/GlobalUpdater/actions/workflows/ci.yml/badge.svg)](https://github.com/LINDECKER-Charles/GlobalUpdater/actions/workflows/ci.yml)
[![Security](https://github.com/LINDECKER-Charles/GlobalUpdater/actions/workflows/security.yml/badge.svg)](https://github.com/LINDECKER-Charles/GlobalUpdater/actions/workflows/security.yml)
[![CodeQL](https://img.shields.io/badge/CodeQL-security--extended-2ea44f?logo=github)](https://github.com/LINDECKER-Charles/GlobalUpdater/actions/workflows/security.yml)
[![Semgrep](https://img.shields.io/badge/semgrep-p%2Ftypescript%20%2B%20p%2Fnodejs-1B4965?logo=semgrep&logoColor=white)](https://github.com/LINDECKER-Charles/GlobalUpdater/actions/workflows/security.yml)
[![Gitleaks](https://img.shields.io/badge/gitleaks-enabled-000?logo=gitleaks)](https://github.com/LINDECKER-Charles/GlobalUpdater/actions/workflows/security.yml)
[![Dependabot](https://img.shields.io/badge/dependabot-weekly-025E8C?logo=dependabot&logoColor=white)](https://github.com/LINDECKER-Charles/GlobalUpdater/blob/main/.github/dependabot.yml)

[![npm](https://img.shields.io/npm/v/@charles_lindecker/gup?logo=npm&color=CB3837)](https://www.npmjs.com/package/@charles_lindecker/gup)
[![Node](https://img.shields.io/badge/node-%E2%89%A520-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/typescript-strict-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vitest](https://img.shields.io/badge/tested%20with-vitest-6E9F18?logo=vitest&logoColor=white)](https://vitest.dev/)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20WSL-0078D6?logo=windows)](https://learn.microsoft.com/windows/wsl/)
[![Providers](https://img.shields.io/badge/providers-130%2B-brightgreen)](docs/providers-catalog.md)

</div>

---

## TL;DR

```powershell
npm install -g @charles_lindecker/gup
gup                # menu interactif
gup list --fast    # scan rapide
gup update --all   # tout mettre à jour
```

## Pourquoi `gup`

Sur une machine de dev, les binaires viennent de **dizaines de sources** (winget, scoop, npm-g, cargo, pipx, dotnet tools, vscode-ext, JetBrains, helm, terraform, kubectl…). Aucun outil natif ne les couvre tous — `winget upgrade --all` ignore silencieusement les paquets pinned, `ncu -g` ne voit que npm, et chaque CLI cloud/IaC/K8s a son propre `self-update`. `gup` unifie le tout derrière une CLI et un menu interactif.

## Installation

### Via npm (recommandé)

```powershell
npm install -g @charles_lindecker/gup
```

Package : [`@charles_lindecker/gup`](https://www.npmjs.com/package/@charles_lindecker/gup) sur npm.

### Depuis les sources

```powershell
git clone https://github.com/LINDECKER-Charles/GlobalUpdater.git
cd GlobalUpdater
npm install
npm run build
npm link            # expose la commande `gup` globalement
```

Prérequis : **Node ≥ 20**, PowerShell ou Bash. Compatible Windows / WSL / Linux.

## Usage

```powershell
gup                                                  # menu interactif
gup list                                             # liste les paquets obsolètes
gup list --fast                                      # skip les scans lents
gup list --provider winget npm-g                     # restreint
gup list --json                                      # sortie JSON pipeable
gup update                                           # sélection interactive
gup update --all -y                                  # tout (sans confirmation, CI)
gup update winget:Microsoft.PowerShell npm-g:typescript
gup doctor                                           # providers détectés vs manquants
```

| Commande | Effet |
|---|---|
| `gup` | Menu interactif : Review / Update selected / Update all / Update target / Providers / Options |
| `gup list` | Liste les paquets obsolètes, table colorisée |
| `gup list --fast` | Skip les scans lents (pwsh-modules, vscode-ext…) |
| `gup list --json` | Sortie JSON brute (pipeable) |
| `gup update` | Sélection multi-paquets interactive |
| `gup update --all` | Tout met à jour (avec confirmation) |
| `gup update <provider:pkg>` | Cibles précises |
| `gup doctor` | Providers détectés + hints d'install |

## Documentation

| Document | Contenu |
|---|---|
| [`docs/architecture.md`](docs/architecture.md) | Architecture interne : couches, modèle de données, scan parallèle, pipeline d'update, sécurité — avec diagrammes mermaid. |
| [`docs/how-gup-works.md`](docs/how-gup-works.md) | Walkthrough technique end-to-end (motivation, modèle, contrats internes, résilience, build). |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | Guide de contribution : workflow d'ajout d'un provider, conventions obligatoires, cas particuliers, checklist PR. |
| [`docs/providers-catalog.md`](docs/providers-catalog.md) | Catalogue exhaustif des 130+ providers, statut d'implémentation, hors scope. |
| [`SECURITY.md`](SECURITY.md) | Threat model, mitigations, reporting de vulnérabilité. |

## Sécurité

| Layer | Outil |
|---|---|
| **Command injection** | `execa` argv-vector, pas de `shell: true` (allowlist pinned par tests) |
| **HTTPS only** | toute requête `fetch()` enforced en `https://` |
| **Static analysis** | CodeQL `security-extended` + `security-and-quality` |
| **SAST** | Semgrep (`.semgrep.yml` + `p/typescript` + `p/nodejs`) |
| **Secrets** | gitleaks |
| **Dependencies** | `audit-ci` + Dependabot (weekly grouped) |
| **Lint** | `eslint-plugin-security` |

```powershell
npm run security        # audit + eslint-security + tests/security
```

Reporting : [private security advisory](https://github.com/LINDECKER-Charles/GlobalUpdater/security/advisories/new). Voir [`SECURITY.md`](SECURITY.md).

## Tests

```powershell
npm run typecheck             # tsc strict + noUncheckedIndexedAccess
npm run test:run              # vitest one-shot
npm run test:coverage         # vitest + v8 coverage
npm run test:security         # suite sécu uniquement
npm run lint                  # eslint
```

CI cross-platform : **Ubuntu** + **Windows**, Node **20** & **22**.

## Hors scope

- **Windows Update OS / drivers** → `PSWindowsUpdate`
- **Maven / Gradle / sbt / bundler / lockfiles** → project-scoped, pas global
- **JetBrains Toolbox-managed IDEs** → la Toolbox a son propre updater

## License

[MIT](LICENSE) © Charles Lindecker
