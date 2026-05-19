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

[![Node](https://img.shields.io/badge/node-%E2%89%A520-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/typescript-strict-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vitest](https://img.shields.io/badge/tested%20with-vitest-6E9F18?logo=vitest&logoColor=white)](https://vitest.dev/)
[![Coverage v8](https://img.shields.io/badge/coverage-v8-F7DF1E?logo=v8)](https://github.com/LINDECKER-Charles/GlobalUpdater/blob/main/package.json)
[![ESLint](https://img.shields.io/badge/eslint-security%20ruleset-4B32C3?logo=eslint&logoColor=white)](https://github.com/LINDECKER-Charles/GlobalUpdater/blob/main/.eslintrc.security.cjs)
[![npm audit](https://img.shields.io/badge/audit--ci-high%2B-CB3837?logo=npm&logoColor=white)](https://github.com/LINDECKER-Charles/GlobalUpdater/blob/main/audit-ci.json)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20WSL-0078D6?logo=windows)](https://learn.microsoft.com/windows/wsl/)
[![Providers](https://img.shields.io/badge/providers-130%2B-brightgreen)](docs/providers-catalog.md)

</div>

---

## ⚡ TL;DR

```powershell
npm install && npm run build && npm link
gup                # menu interactif
gup list --fast    # scan rapide
gup update --all   # tout mettre à jour
```

---

## 🎯 Pourquoi `gup`

Sur une machine de dev, les binaires viennent de **dizaines de sources différentes** (winget, scoop, npm-g, cargo, pipx, dotnet tools, vscode-ext, JetBrains, helm, terraform, kubectl, gh extensions…). Aucun outil natif ne les couvre tous :

- `winget upgrade --all` **ignore silencieusement** les paquets pinned et ceux en version "unknown" (Chrome, Discord, etc.)
- `ncu -g` ne voit que npm — pas pnpm, pas yarn, pas bun
- Les CLIs cloud / IaC / K8s ont chacun leur propre `self-update` à invoquer à la main

`gup` unifie tout ça derrière **une seule CLI**, un menu interactif, et un mode non-interactif pour automatisation.

---

## 📦 Installation

```powershell
git clone https://github.com/LINDECKER-Charles/GlobalUpdater.git
cd GlobalUpdater
npm install
npm run build
npm link            # expose la commande `gup` globalement
```

Prérequis : **Node ≥ 20**, PowerShell ou Bash. Compatible Windows / WSL / Linux.

---

## 🚀 Usage

### Menu interactif (par défaut)

```powershell
gup
```

Scan automatique au lancement, puis menu : **Review** · **Update selected** · **Update all** · **Update target** · **Providers** · **Options** (fast mode, filtre).

### Mode non-interactif

| Commande | Effet |
|---|---|
| `gup list` | Liste les paquets obsolètes, table colorisée |
| `gup list --fast` | Skip les scans lents (pwsh-modules, vscode-ext, …) |
| `gup list --provider winget npm-g` | Restreint aux providers donnés |
| `gup list --json` | Sortie JSON brute (pipeable) |
| `gup update` | Sélection multi-paquets interactive |
| `gup update --all` | Tout met à jour (confirmation) |
| `gup update --all -y` | Tout met à jour (sans confirmation) — usage CI |
| `gup update winget:Microsoft.PowerShell npm-g:typescript` | Cibles précises |
| `gup doctor` | Providers détectés vs manquants (+ hint d'install) |

---

## 🧩 Providers (130+)

Snapshot par catégorie — détail complet et statut dans [`docs/providers-catalog.md`](docs/providers-catalog.md).

| Catégorie | Exemples | # |
|---|---|---:|
| **OS / Windows** | `winget`, `scoop`, `choco` | 3 |
| **WSL** | `wsl`, `wsl-apt`, `wsl-dnf`, `wsl-pacman`, `wsl-brew`, `wsl-flatpak`, `wsl-nix` | 7 |
| **Node.js / JS** | `npm-g`, `pnpm-g`, `yarn-g`, `bun-g`, `deno`, `corepack`, `fnm`, `volta`, `nvm-windows` | 9 |
| **Python** | `pip`, `pipx`, `uv-tools`, `poetry`, `pdm`, `rye`, `pyenv-win`, `conda` | 8 |
| **.NET / PHP** | `dotnet-tools`, `composer-self`, `composer-g`, `symfony-cli`, `phive` | 5 |
| **JVM** | `jbang`, `coursier-cs` | 2 |
| **Rust** | `rustup`, `cargo` | 2 |
| **Autres langages** | `gem`, `opam`, `hex`, `mix`, `luarocks`, `cabal`, `stack`, `nimble`, `julia`, `r`, `flutter`, `pub-global` | 12 |
| **Toolchain polyglottes** | `mise`, `asdf`, `proto`, `sdkman`, `goenv` | 5 |
| **Cloud CLIs** | `az`, `gcloud`, `aws`, `oci`, `scw`, `hcloud`, `linode`, `doctl`, `supabase`, `heroku`, `railway`, `flyctl` | 12 |
| **IaC** | `terraform`, `opentofu`, `terragrunt`, `vault`, `consul`, `nomad`, `packer`, `boundary`, `tflint`, `pulumi` | 10 |
| **Kubernetes / Helm** | `helm`, `helm-repo`, `helm-plugins`, `kubectl`, `krew`, `kustomize`, `flux`, `argocd`, `k3d`, `kind`, `minikube`, `skaffold`, `tilt` | 13 |
| **Containers / OCI** | `nerdctl`, `oras`, `dive`, `docker-images`, `docker-desktop`, `podman-desktop`, `rancher-desktop` | 7 |
| **Security scanning** | `trivy`, `grype`, `syft`, `cosign`, `rekor`, `gitsign`, `nuclei`, `pdtm`, `semgrep` | 10 |
| **Dev CLIs** | `lazygit`, `lazydocker`, `jj`, `delta`, `glab`, `tea`, `gh-ext` | 7 |
| **IDEs / Extensions** | `vscode-ext`, `cursor-ext`, `windsurf-ext`, `vscodium-ext`, `jetbrains` | 5 |
| **Editor plugins** | `nvim-lazy`, `nvim-packer`, `nvim-mason`, `vim-plug` | 4 |
| **Embedded / Mobile** | `arduino-cli`, `platformio`, `android-sdk`, `expo`, `fastlane` | 5 |
| **Shell** | `oh-my-posh`, `starship`, `nerd-fonts`, `pwsh-modules` | 4 |
| **Meta** | `self` (auto-MAJ des PM eux-mêmes) | 1 |

> `gup doctor` te dit lesquels sont détectés sur ta machine et te donne le hint d'install pour les autres.

---

## 🔒 Sécurité

`gup` shell-out sur des dizaines de gestionnaires. La surface d'attaque est prise au sérieux. Voir [`SECURITY.md`](SECURITY.md).

| Layer | Outil |
|---|---|
| **Command injection** | `execa` argv-vector, pas de `shell: true` (pinned par tests) |
| **HTTPS only** | toute requête `fetch()` enforced en `https://` |
| **Static analysis** | CodeQL `security-extended` + `security-and-quality` |
| **SAST** | Semgrep (`.semgrep.yml` + `p/typescript` + `p/nodejs`) |
| **Secrets** | gitleaks |
| **Dependencies** | `audit-ci` (CI) + Dependabot (weekly, grouped) |
| **Lint** | `eslint-plugin-security` |

```powershell
npm run security        # audit + eslint-security + tests/security
```

Pour reporter une vuln : [private security advisory](https://github.com/LINDECKER-Charles/GlobalUpdater/security/advisories/new).

---

## 🧪 Tests & Qualité

```powershell
npm run typecheck             # tsc strict + noUncheckedIndexedAccess
npm run test                  # vitest (watch)
npm run test:run              # vitest (one-shot)
npm run test:coverage         # vitest + v8 coverage
npm run test:security         # suite sécu uniquement
npm run lint                  # eslint
```

CI cross-platform : **Ubuntu** + **Windows**, Node **20** & **22**.

---

## 🛠 Contribuer

Ajouter un provider = copier `src/providers/_template.ts`, implémenter 4 méthodes, register dans `src/core/registry.ts`. Détails dans [`CONTRIBUTING.md`](CONTRIBUTING.md).

```ts
class MyProvider implements Provider {
  readonly id = "my-tool";
  readonly displayName = "My Tool";
  readonly installHint = "winget install MyTool";
  readonly slow = false;
  async isAvailable() { /* ... */ }
  async listOutdated() { /* ... */ }
  async update(id) { /* ... */ }
  async updateAll(packages) { /* ... */ }
}
```

Conventions clé : **un fichier = un provider**, **aucun throw** dans `listOutdated`/`update` (un provider qui casse ne casse pas les autres), `run()` / `runInherit()` from `core/runner.ts` plutôt que `child_process`, `fetch` borné par `AbortSignal.timeout(5_000)`.

---

## 📐 Architecture

```
src/
├── cli.ts                    # entry commander
├── commands/                 # list / update / doctor / menu
├── core/
│   ├── types.ts              # Provider, OutdatedPackage, UpdateOutcome
│   ├── runner.ts             # execa wrapper (Windows-safe)
│   ├── registry.ts           # ALL_PROVIDERS + scan parallèle (pLimit)
│   ├── gh-releases.ts        # helper GitHub Releases
│   ├── hashicorp-releases.ts # helper HashiCorp Releases
│   └── wsl.ts                # bridge WSL
├── providers/                # 1 fichier = 1 source
│   ├── os/ wsl/ node/ python/ rust/ dotnet-php/ jvm/ lang-other/
│   ├── toolchain/ cloud/ iac/ kubernetes/ containers/ security/
│   └── dev-cli/ ide/ editor-plugins/ embedded-mobile/ shell/
└── ui/                       # table + spinners + inquirer prompts
```

---

## ❌ Hors scope

- **Windows Update OS / drivers** → `PSWindowsUpdate`
- **Maven / Gradle / sbt / bundler / lockfiles** → project-scoped, pas global
- **JetBrains Toolbox-managed IDEs** → la Toolbox a son propre updater

---

## 📄 License

[MIT](LICENSE) © Charles Lindecker
