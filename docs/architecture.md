# Architecture

Vue technique de `gup`. Cible : contributeurs, mainteneurs, revue de sécurité.

> Pour la liste complète des providers et leur statut d'implémentation : [`providers-catalog.md`](providers-catalog.md).
> Pour ajouter un provider : [`../CONTRIBUTING.md`](../CONTRIBUTING.md).

---

## Sommaire

- [1. Vue d'ensemble](#1-vue-densemble)
- [2. Couches & responsabilités](#2-couches--responsabilités)
- [3. Modèle de données](#3-modèle-de-données)
- [4. Cycle de vie d'un provider](#4-cycle-de-vie-dun-provider)
- [5. Scan parallèle](#5-scan-parallèle)
- [6. Pipeline d'update + retry](#6-pipeline-dupdate--retry)
- [7. Mode interactif (menu)](#7-mode-interactif-menu)
- [8. Runner & isolation des effets de bord](#8-runner--isolation-des-effets-de-bord)
- [9. Helpers transverses](#9-helpers-transverses)
- [10. Sécurité](#10-sécurité)
- [11. Arborescence](#11-arborescence)

---

## 1. Vue d'ensemble

`gup` est un orchestrateur stateless : il découvre les gestionnaires de paquets installés sur la machine, leur demande **ce qui est obsolète**, puis leur délègue **les mises à jour**. Aucune base de données, aucun cache persistant.

```mermaid
flowchart LR
    User([Utilisateur]) -->|gup| CLI[cli.ts<br/>Commander]
    CLI --> Menu[menu.ts<br/>interactif]
    CLI --> List[list.ts]
    CLI --> Update[update.ts]
    CLI --> Doctor[doctor.ts]

    Menu & List & Update & Doctor --> Registry[(registry.ts<br/>ALL_PROVIDERS)]
    Registry -->|scan parallèle<br/>pLimit| Providers[Providers<br/>~130 modules]
    Providers -->|run / runInherit| Runner[runner.ts<br/>execa wrapper]
    Runner --> Tools[(winget · scoop · npm<br/>cargo · pipx · helm · …)]

    Providers -.fetch HTTPS.-> Releases[(gh-releases<br/>hashicorp-releases)]

    classDef boundary stroke-dasharray: 4 4
    class Tools,Releases boundary
```

**Principes :**

- **Un fichier = un provider.** Pas de couplage horizontal entre providers.
- **Aucun `throw` dans `listOutdated` / `update`.** Un provider qui casse ne casse pas les autres.
- **Pas de `child_process` direct.** Tout passe par `core/runner.ts` (encoding Windows, no-shell).
- **Pas de cache.** Chaque invocation rescanne — comportement déterministe, pas de drift.

---

## 2. Couches & responsabilités

```mermaid
flowchart TB
    subgraph CLI["cli.ts — entry"]
        Commander[Commander<br/>parsing argv]
    end

    subgraph Commands["commands/ — orchestration"]
        ListCmd[list.ts]
        UpdateCmd[update.ts]
        DoctorCmd[doctor.ts]
        MenuCmd[menu.ts]
    end

    subgraph Core["core/ — domain"]
        Types[types.ts<br/>Provider · OutdatedPackage<br/>UpdateOutcome · UpdateOptions]
        RegistryC[registry.ts<br/>ALL_PROVIDERS<br/>scanAll · getProvider]
        RunnerC[runner.ts<br/>run · runInherit<br/>commandExists · isElevated]
        Helpers[gh-releases · hashicorp-releases<br/>wsl · install-source<br/>corepack-ownership · nvim-paths]
    end

    subgraph UI["ui/ — rendu terminal"]
        Table[table.ts]
        Select[select.ts]
        Progress[scan-progress.ts]
        Retry[retry-failed.ts]
    end

    subgraph ProvidersLayer["providers/ — adaptateurs"]
        OS[os/]
        Wsl[wsl/]
        Node[node/]
        Python[python/]
        Cloud[cloud/]
        K8s[kubernetes/]
        Etc[...]
    end

    Commander --> ListCmd & UpdateCmd & DoctorCmd & MenuCmd
    ListCmd & UpdateCmd & DoctorCmd & MenuCmd --> RegistryC
    ListCmd & UpdateCmd & DoctorCmd & MenuCmd --> UI
    RegistryC --> ProvidersLayer
    ProvidersLayer --> RunnerC
    ProvidersLayer --> Helpers
    ProvidersLayer -.implémente.-> Types
```

| Couche | Rôle | Règle |
|---|---|---|
| `cli.ts` | Parsing argv + dispatch | Pas de logique métier. |
| `commands/` | Orchestration d'un cas d'usage (list / update / doctor / menu) | Compose registry + UI. |
| `core/` | Domaine + primitives (runner, types, registry, helpers) | Aucune dépendance vers `ui/` ou `providers/`. |
| `ui/` | Rendu terminal (tables, prompts, spinners) | Aucune logique métier — uniquement de la présentation. |
| `providers/` | Adaptateurs vers un gestionnaire de paquets externe | Implémente `Provider`. Pas d'import croisé. |

---

## 3. Modèle de données

Trois interfaces drivent l'ensemble du système.

```mermaid
classDiagram
    class Provider {
        <<interface>>
        +readonly id: string
        +readonly displayName: string
        +readonly installHint?: string
        +readonly slow?: boolean
        +isAvailable() Promise~boolean~
        +listOutdated() Promise~OutdatedPackage[]~
        +update(packageId, options?) Promise~UpdateOutcome~
        +updateAll(packages, options?) Promise~UpdateOutcome[]~
    }

    class OutdatedPackage {
        +id: string
        +name?: string
        +current: string
        +latest: string
        +note?: string
        +manual?: boolean
    }

    class UpdateOutcome {
        +id: string
        +success: boolean
        +skipped?: boolean
        +message?: string
        +retryable?: boolean
    }

    class UpdateOptions {
        +force?: boolean
        +uninstallPrevious?: boolean
        +reinstall?: boolean
    }

    class ProviderScanResult {
        +providerId: string
        +available: boolean
        +packages: OutdatedPackage[]
        +error?: string
    }

    Provider ..> OutdatedPackage : produit
    Provider ..> UpdateOutcome : produit
    Provider ..> UpdateOptions : accepte
    ProviderScanResult o-- OutdatedPackage
```

**Sémantique fine :**

- `manual: true` → l'item est filtré par `scanAll` avant d'arriver à l'UI (jamais affiché, jamais inclus dans `update --all`). Sert aux items qui exigent une action GUI (JetBrains Toolbox, Eclipse Marketplace…).
- `slow: true` sur le provider → exclu en `--fast`. Réservé aux scans qui font du HTTP par paquet ou du walk filesystem.
- `skipped: true` dans l'outcome → différent de `success: false`. Surfacé en **jaune `SKIP`** vs **rouge `FAIL`**.
- `retryable: true` → autorise la boucle de retry à proposer `--force` / `--uninstall-previous` / `reinstall` (typique winget hash mismatch).

---

## 4. Cycle de vie d'un provider

```mermaid
sequenceDiagram
    autonumber
    participant CLI as commands/*
    participant Reg as registry.ts
    participant P as Provider
    participant Run as runner.ts
    participant Bin as Outil externe

    CLI->>Reg: detectAvailableProviders()
    Reg->>P: isAvailable()
    P->>Run: commandExists(bin)
    Run->>Bin: where/which bin
    Bin-->>Run: exit 0/1
    Run-->>P: boolean
    P-->>Reg: available?

    Note over Reg: filter fast + only

    CLI->>Reg: scanAll(opts)
    par pour chaque provider détecté (pLimit=4)
        Reg->>P: listOutdated()
        P->>Run: run(bin, [args])
        Run->>Bin: spawn (no shell)
        Bin-->>Run: stdout
        Run-->>P: parsed
        P-->>Reg: OutdatedPackage[]
    end
    Reg-->>CLI: ProviderScanResult[]

    Note over CLI: user picks packages

    CLI->>P: update(packageId) ou updateAll(...)
    P->>Run: runInherit(bin, [upgrade])
    Run->>Bin: spawn stdio=inherit
    Bin-->>CLI: stream stdout/stderr
    P-->>CLI: UpdateOutcome
```

**Garanties :**

- `isAvailable` ne fait **jamais d'I/O réseau** — uniquement `where/which` ou check de fichier.
- `listOutdated` peut faire du HTTP (release latest) mais doit borner via `AbortSignal.timeout(5_000)`.
- `update` utilise `runInherit` pour que l'utilisateur voie le progress bar du gestionnaire en temps réel.

---

## 5. Scan parallèle

`registry.ts:scanAll` est le seul endroit où la concurrence est gérée.

```mermaid
flowchart LR
    Start([scanAll opts]) --> Detect{detected<br/>fourni ?}
    Detect -->|oui| Filter
    Detect -->|non| Probe[detectAvailableProviders<br/>Promise.all sur isAvailable]
    Probe --> Filter[filtrer: only / fast]
    Filter --> Limit[pLimit concurrency=4]
    Limit --> P1[listOutdated A]
    Limit --> P2[listOutdated B]
    Limit --> P3[...]
    P1 & P2 & P3 --> Catch{try/catch}
    Catch -->|ok| FilterManual[drop manual:true]
    Catch -->|throw| Error[error: msg]
    FilterManual --> Result[ProviderScanResult]
    Error --> Result
    Result --> End([retourne array])
```

**Points clés :**

- `pLimit=4` par défaut → évite de saturer la machine quand winget + scoop + choco + cargo + pipx scannent en même temps.
- Chaque erreur est isolée dans un `try/catch` au sein du callback `pLimit` → **aucune erreur ne propage**. Le résultat porte `error: string` au lieu d'exception.
- `manual: true` est filtré dans `scanAll` (registry.ts:426) → les couches au-dessus ne voient jamais ces items.
- Hooks UI : `onProviderStart` / `onProviderEnd` permettent à `ui/scan-progress.ts` d'afficher un compteur live sans coupler le scan au rendu.

---

## 6. Pipeline d'update + retry

Le flow d'update partage la même structure entre `update` CLI et `runSelect`/`runAll` du menu.

```mermaid
flowchart TD
    Start([sélection N packages]) --> Group[grouper par providerId]
    Group --> Loop{pour chaque<br/>provider}
    Loop --> Bulk{N==1 ?}
    Bulk -->|oui| One[provider.update id]
    Bulk -->|non| Many[provider.updateAll pkgs]
    One & Many --> Collect[collecte UpdateOutcome]
    Collect --> Loop
    Loop -->|fini| Summary[summarize]

    Summary --> Retry{retryable<br/>présent ?}
    Retry -->|non| End([exit code])
    Retry -->|oui| Strategy{user choisit}
    Strategy -->|none| End
    Strategy -->|force| F[options.force=true]
    Strategy -->|force+uninstall| FU[options.force + uninstallPrevious]
    Strategy -->|reinstall| R[options.reinstall=true]
    F & FU & R --> Rerun[provider.update avec options]
    Rerun --> Summary
```

**Stratégies de retry** (ui/retry-failed.ts) — ordre du moins au plus destructif :

| Stratégie | Flags | Usage typique |
|---|---|---|
| `--force` | `force=true` | winget hash mismatch (manifest locale-specific). |
| `--force --uninstall-previous` | `force=true`, `uninstallPrevious=true` | Techno d'installer changée. **Destructif** : config hors `%APPDATA%` perdue. |
| `uninstall + install` | `force=true`, `reinstall=true` | Dernier recours : `--uninstall-previous` ne se déclenche pas (version installée "Unknown"). |

Le user doit explicitement choisir : aucune escalade automatique → la destruction de config n'arrive jamais sans consentement.

---

## 7. Mode interactif (menu)

Le menu est une state-machine au-dessus du même registry.

```mermaid
stateDiagram-v2
    [*] --> InitialScan
    InitialScan --> Idle: scans + detectedCount

    Idle --> Idle: Scan (rescan)
    Idle --> Review: total > 0
    Review --> Idle

    Idle --> SelectPkg: total > 0
    SelectPkg --> ConfirmSel
    ConfirmSel --> ApplyUpdates: oui
    ConfirmSel --> Idle: non

    Idle --> ConfirmAll: total > 0
    ConfirmAll --> ApplyUpdates: oui
    ConfirmAll --> Idle: non

    Idle --> InputTarget
    InputTarget --> ApplyUpdates

    ApplyUpdates --> MaybeRetry
    MaybeRetry --> ApplyUpdates: retry strategy
    MaybeRetry --> InitialScan: done

    Idle --> Doctor: providers status
    Doctor --> Idle

    Idle --> Options
    Options --> Idle: fast / filter toggled

    Idle --> [*]: Quit
```

L'état (`MenuState`) tient quatre choses : `scans`, `fast`, `filter`, `detectedCount`. Pas d'autre persistance. Re-scanner = recharger l'état.

---

## 8. Runner & isolation des effets de bord

`core/runner.ts` est le **seul** point où `gup` spawn un sous-processus. Tous les providers passent par lui.

```mermaid
flowchart LR
    P[Provider] --> R{run /<br/>runInherit ?}
    R -->|capture| Cap[run<br/>encoding=utf8<br/>stripFinalNewline<br/>reject=false]
    R -->|stream| Inh[runInherit<br/>stdio=inherit<br/>reject=false]
    Cap & Inh --> Execa[execa]
    Execa --> Spawn[spawn argv vector<br/>NO shell:true]
    Spawn --> Bin[(binaire externe)]

    Cap -.résultat.-> Result["RunResult{stdout,stderr,exitCode,failed}"]
    Inh -.résultat.-> Result
```

**Invariants vérifiés par tests sécu** :

- `shell: true` interdit hors d'une **allowlist** (Scoop PowerShell shim) — `tests/security/shell-usage.test.ts`.
- `fetch()` doit cibler `https://` uniquement — `tests/security/http-targets.test.ts`.
- `inferSourceFromPath` pinned — `tests/security/install-source.test.ts`.
- Aucun `child_process` importé hors `runner.ts`.

**Helpers utilitaires** :

- `commandExists(cmd)` → wrapper `where`/`which`.
- `whichFirst(cmd)` → chemin absolu de la 1ʳᵉ résolution PATH (utile pour `inferSourceFromPath`).
- `isElevated()` → sonde admin Windows via `net session` (utilisé par choco).

---

## 9. Helpers transverses

Modules dans `core/` partagés entre providers — toujours sans état.

| Helper | Rôle |
|---|---|
| `gh-releases.ts` | Latest tag GitHub Releases (helm-plugins, lazygit, jj, …). Fetch + parse + cache de la requête en cours uniquement. |
| `hashicorp-releases.ts` | Index HashiCorp (`releases.hashicorp.com`) pour terraform/vault/consul/nomad/packer/boundary. |
| `wsl.ts` | Bridge `wsl -d <distro> -- <cmd>` mutualisé pour tous les providers `wsl-*`. |
| `install-source.ts` | Décide quel PM possède un binaire (`%LocalAppData%\Microsoft\WinGet` → winget, `~\scoop\shims` → scoop, …). Critique sécurité → pinned. |
| `corepack-ownership.ts` | Détecte si pnpm/yarn sont managés par corepack pour router l'update au bon endroit. |
| `nvim-paths.ts` | Résout les chemins de config Neovim cross-platform (lazy/packer/mason). |

---

## 10. Sécurité

Schéma synthétique — détails opérationnels dans [`../SECURITY.md`](../SECURITY.md).

```mermaid
flowchart TB
    subgraph Surface["Surface d'attaque"]
        Mani[Manifest hostile<br/>package id]
        MITM[MITM probe versions]
        Misroute[Mauvais provider<br/>pour un binaire]
    end

    subgraph Mitigation["Mitigations"]
        Argv[execa argv vector<br/>shell:true allowlisté]
        Https[fetch HTTPS only<br/>AbortSignal.timeout 5s]
        PinSource[install-source<br/>tests pinned]
    end

    subgraph CI["CI gates"]
        Eslint[eslint-plugin-security]
        Semgrep[Semgrep + .semgrep.yml]
        CodeQL[CodeQL extended]
        Gitleaks[gitleaks]
        AuditCI[audit-ci high+]
        Dependabot[Dependabot weekly]
    end

    Mani -.couvert par.-> Argv
    MITM -.couvert par.-> Https
    Misroute -.couvert par.-> PinSource
    Argv & Https & PinSource -.vérifié par.-> CI
```

---

## 11. Arborescence

```
src/
├── cli.ts                          # commander entry
├── commands/
│   ├── list.ts                     # gup list
│   ├── update.ts                   # gup update
│   ├── doctor.ts                   # gup doctor
│   └── menu.ts                     # gup (interactif)
├── core/
│   ├── types.ts                    # Provider, OutdatedPackage, UpdateOutcome, UpdateOptions
│   ├── runner.ts                   # execa wrapper Windows-safe
│   ├── registry.ts                 # ALL_PROVIDERS, scanAll (pLimit)
│   ├── gh-releases.ts              # GitHub releases helper
│   ├── hashicorp-releases.ts       # HashiCorp releases helper
│   ├── wsl.ts                      # WSL bridge
│   ├── install-source.ts           # PM ownership detection (security-critical)
│   ├── corepack-ownership.ts       # corepack vs standalone routing
│   └── nvim-paths.ts               # Neovim config paths
├── providers/                      # 1 fichier = 1 source
│   ├── _template.ts                # à copier pour démarrer
│   ├── os/                         # winget, scoop, choco
│   ├── wsl/                        # wsl, wsl-apt, wsl-dnf, …
│   ├── node/                       # npm-g, pnpm-g, yarn-g, bun-g, deno, corepack, fnm, volta, nvm-windows
│   ├── python/                     # pip, pipx, uv-tools, poetry, pdm, rye, pyenv-win, conda
│   ├── rust/                       # rustup, cargo
│   ├── dotnet-php/                 # dotnet-tools, composer-*, symfony-cli, phive
│   ├── jvm/                        # jbang, coursier-cs
│   ├── lang-other/                 # gem, opam, hex, mix, luarocks, cabal, stack, nimble, julia, r, flutter, pub-global
│   ├── toolchain/                  # mise, asdf, proto, sdkman, goenv
│   ├── cloud/                      # az, gcloud, aws, oci, scw, hcloud, linode, doctl, supabase, heroku, railway, flyctl
│   ├── iac/                        # terraform, opentofu, terragrunt, vault, consul, nomad, packer, boundary, tflint, pulumi
│   ├── kubernetes/                 # helm*, kubectl, krew, kustomize, flux, argocd, k3d, kind, minikube, skaffold, tilt
│   ├── containers/                 # nerdctl, oras, dive, docker-*, podman-desktop, rancher-desktop
│   ├── security/                   # trivy, grype, syft, cosign, rekor, gitsign, nuclei, pdtm, semgrep
│   ├── dev-cli/                    # lazygit, lazydocker, jj, delta, glab, tea, gh-extensions
│   ├── ide/                        # vscode-ext, cursor-ext, windsurf-ext, vscodium-ext, jetbrains (+ manuels non-câblés)
│   ├── editor-plugins/             # nvim-lazy, nvim-packer, nvim-mason, vim-plug
│   ├── embedded-mobile/            # arduino-cli, platformio, android-sdk, expo, fastlane
│   ├── shell/                      # oh-my-posh, starship, nerd-fonts, pwsh-modules
│   └── self.ts                     # auto-MAJ des PM eux-mêmes
└── ui/
    ├── table.ts                    # cli-table3 + chalk rendering
    ├── select.ts                   # checkbox multi-package
    ├── scan-progress.ts            # spinner + live counter (ora)
    └── retry-failed.ts             # retry strategy prompt
```

---

## Décisions notables

- **Pas de cache disque.** Le coût d'un scan est dominé par les outils externes (winget peut prendre 10s). Cacher introduirait du drift sans gain proportionnel. `--fast` suffit pour les workflows itératifs.
- **Pas de plugin system.** Ajouter un provider = écrire un fichier + une ligne dans `registry.ts`. Plus simple qu'un mécanisme de discovery dynamique, et garde la surface de sécurité bornée.
- **CLI français pour les messages utilisateur, anglais pour le code.** Le projet a un user FR-first, mais la base de code reste accessible internationalement.
- **`updateAll` peut être un bulk ou une boucle.** Le contrat n'impose pas l'efficience : si l'outil propose un `upgrade --all` natif, le provider l'utilise ; sinon il itère sur `update(id)`. Le caller ne voit pas la différence.
