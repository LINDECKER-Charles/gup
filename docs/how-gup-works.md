# How `gup` works — End-to-end technical walkthrough

> Document source pour la création d'un site explicatif. Destiné à un public développeur intermédiaire / confirmé. Détaille **l'intégralité** du fonctionnement de `gup` : motivation, modèle, architecture, cycle de vie d'une commande, contrats internes, patterns de résilience, sécurité, build.
>
> Repo : `LINDECKER-Charles/GlobalUpdater` · Stack : TypeScript strict (Node ≥ 20), ESM, `execa`, `commander`, `@inquirer/prompts`, `chalk`, `cli-table3`, `ora`, `p-limit`. Aucun runtime browser, aucun framework UI : c'est une CLI pure.

---

## 0. Élévateur

`gup` ("Global Updater") est une **CLI unifiée** qui scanne en parallèle ~130 sources d'installation différentes (gestionnaires de paquets OS, runtimes, outils dev, extensions IDE, registries cloud / IaC / K8s…), liste tout ce qui est obsolète, puis exécute les commandes natives de mise à jour de chaque source.

C'est volontairement un **orchestrateur d'outils existants**. `gup` n'invente pas de protocole d'update, n'embarque pas de cache de versions, ne télécharge rien lui-même : il **shell-out** sur `winget upgrade`, `npm outdated -g --json`, `helm repo update`, `pip list --outdated --format json`, etc., et homogénéise leurs sorties hétérogènes derrière une seule interface utilisateur.

Trois manières de l'utiliser :

1. **Menu interactif** (commande nue `gup`) — scan automatique, puis menu Review / Update selected / Update all / Update target / Providers / Options.
2. **Non-interactif** (`gup list`, `gup update --all -y`) — adapté à l'automatisation et au CI.
3. **Ciblé** (`gup update winget:Microsoft.PowerShell npm-g:typescript`) — bypass complet du scan.

---

## 1. Pourquoi `gup` existe — le problème métier

Sur une station de dev moderne, un binaire peut venir de **dizaines de sources concurrentes**, chacune avec :

- Sa propre commande de listing des updates (`winget upgrade`, `npm outdated -g --json`, `pipx list`, `scoop status`, `helm repo update && helm search repo`, `gem outdated`, `dotnet tool list -g`, `cargo install --list`, `cs update --installed`, `kubectl version`, etc.).
- Son propre format de sortie (table texte fixe-largeur, JSON, JSONL, YAML, sortie humaine localisée…).
- Ses propres edge-cases : `winget` ignore silencieusement les paquets "pinned" et "unknown version" ; `ncu -g` ne voit que npm ; les CLIs cloud (`az`, `gcloud`, `aws`) ont chacun leur sous-commande `self-update` à invoquer à la main ; les outils HashiCorp (`terraform`, `vault`, `consul`, …) n'ont pas de updater intégré du tout et doivent être comparés à leur feed de releases.

Constat : **aucun outil natif ne couvre l'ensemble**. La conséquence pratique pour un développeur est d'avoir 10–15 commandes à enchaîner manuellement, plusieurs fois par mois, sans savoir laquelle a oublié quoi.

`gup` réduit ça à **une commande** + une boucle de scan parallèle + une UI cohérente.

### Ce que `gup` n'est PAS

- Pas un gestionnaire de paquets. Il ne *publie* rien, ne *résout* aucune dépendance, ne maintient pas d'état partagé.
- Pas un agent permanent. Pas de daemon, pas de tray, pas de polling background. Tout est on-demand.
- Pas un outil project-scoped. `package.json`, `requirements.txt`, `Cargo.toml`, `composer.json` — hors scope. `gup` cible exclusivement les installs **globales** d'une machine.
- Pas un outil Windows Update / driver / kernel. `PSWindowsUpdate` couvre déjà ça.

### Hors scope explicite (cf. `README.md` §❌)

- Windows Update OS / drivers OEM / services SYSTEM / DISM / Appx provisionnés.
- Lockfiles project-scoped (Maven, Gradle, sbt, bundler, `npm ci`, `pip-tools sync`).
- JetBrains Toolbox-managed IDEs (la Toolbox a son propre updater).

---

## 2. Vocabulaire / concepts clés

Un seul vocabulaire à intérioriser :

| Terme | Définition |
|---|---|
| **Provider** | Module isolé qui sait gérer **une** source d'installation. Un fichier = un provider. Implémente l'interface `Provider` (`src/core/types.ts`). Exemples : `WingetProvider`, `NpmGlobalProvider`, `HelmProvider`. |
| **Provider id** | Identifiant kebab-case stable, unique sur l'ensemble du registry. Utilisé en CLI : `gup update <provider-id>:<packageId>` (ex. `winget:Microsoft.PowerShell`). |
| **OutdatedPackage** | Une entrée dans le résultat de scan : `{ id, name?, current, latest, note?, manual? }`. C'est la **monnaie d'échange** entre la couche Provider et l'UI. |
| **UpdateOutcome** | Résultat d'un update : `{ id, success, skipped?, message?, retryable? }`. |
| **ProviderScanResult** | Agrégat par provider après scan : `{ providerId, available, packages[], error? }`. |
| **slow** | Flag déclaratif sur un Provider (`readonly slow = true`) qui désactive son scan en mode `--fast`. À utiliser quand le scan fait du HTTP par paquet ou du filesystem-walk lourd. |
| **manual** | Flag sur un `OutdatedPackage` qui signifie "le provider sait dès maintenant que l'update demandera une intervention humaine". Filtré hors `scanAll` → jamais montré à l'utilisateur, jamais inclus dans Update all. |
| **skipped** | Flag dans `UpdateOutcome` : l'update a été tenté puis abandonné proprement (action humaine requise — ex. terminal admin manquant, GUI uniquement). Affiché en jaune `SKIP`, distinct du rouge `FAIL`. |
| **retryable** | Flag dans `UpdateOutcome` : l'échec pourrait passer avec une stratégie plus agressive (`--force`, `--uninstall-previous`, reinstall en 2 étapes). Active la prompt de retry post-batch. |

Ces sept primitives suffisent à modéliser l'ensemble des comportements de `gup`.

---

## 3. Architecture vue d'avion

```
                           ┌─────────────────────┐
        user typing  ─────▶│   src/cli.ts        │  commander, dispatch sous-cmds
                           └──────────┬──────────┘
                                      │
            ┌──────────┬───────────┬──┴───────────┬──────────────┐
            ▼          ▼           ▼              ▼              ▼
        list.ts    update.ts   doctor.ts       menu.ts        (no subcmd
                                                              → menu)
            │          │           │              │
            └──────────┴────┬──────┴──────────────┘
                            ▼
                  ┌─────────────────────┐
                  │  ui/scan-progress   │  ora spinner, live in-flight names
                  └──────────┬──────────┘
                             │
                  ┌──────────▼──────────┐
                  │   core/registry     │  ALL_PROVIDERS[], scanAll, pLimit
                  └──────────┬──────────┘
                             │ fan-out (concurrency=4 par défaut)
       ┌────────┬────────┬───┴────┬────────┬────────┬───────┐
       ▼        ▼        ▼        ▼        ▼        ▼       ▼
   winget    npm-g    pip     helm     cargo   kubectl   ... ×130
       │        │        │        │        │        │
       └────────┴────────┴───┬────┴────────┴────────┘
                             │ run() / runInherit()
                             ▼
                  ┌─────────────────────┐
                  │   core/runner       │  execa, UTF-8, no shell:true
                  └─────────────────────┘
                             │
                             ▼
                    OS subprocess (winget.exe, npm.cmd, …)
```

### Layout des fichiers

```
src/
├── cli.ts                    # entrée commander
├── commands/                 # 1 fichier = 1 sous-commande utilisateur
│   ├── list.ts               # gup list
│   ├── update.ts             # gup update
│   ├── doctor.ts             # gup doctor
│   └── menu.ts               # gup (sans sous-cmd) — REPL interactif
├── core/
│   ├── types.ts              # Provider, OutdatedPackage, UpdateOutcome, UpdateOptions, ProviderScanResult
│   ├── runner.ts             # run, runInherit, commandExists, whichFirst, isElevated
│   ├── registry.ts           # ALL_PROVIDERS, detectAvailableProviders, scanAll, getProvider
│   ├── gh-releases.ts        # fetchGitHubReleaseLatest, fetchGitHubReleaseTagMatching, normalizeVersion
│   ├── hashicorp-releases.ts # helper pour Terraform / Vault / Consul / Nomad / Packer / Boundary
│   ├── wsl.ts                # pont d'invocation `wsl.exe -d <distro> -- <cmd>`
│   ├── install-source.ts     # heuristique pour deviner quel PM possède un binaire (delegateUpdate)
│   ├── corepack-ownership.ts # détection "pnpm/yarn est-il un shim corepack ?"
│   └── nvim-paths.ts         # localisation des configs neovim (lazy / packer / mason)
├── providers/                # 1 fichier = 1 provider
│   ├── _template.ts          # squelette à copier pour ajouter un provider
│   ├── self.ts               # méta-provider : update des PM eux-mêmes
│   ├── os/                   # winget, scoop, choco
│   ├── wsl/                  # wsl, wsl-apt, wsl-dnf, wsl-pacman, wsl-brew, wsl-flatpak, wsl-nix
│   ├── node/                 # npm-g, pnpm-g, yarn-g, bun-g, deno, corepack, fnm, volta, nvm-windows
│   ├── python/               # pip, pipx, uv-tools, poetry, pdm, rye, pyenv-win, conda
│   ├── rust/                 # rustup, cargo
│   ├── dotnet-php/           # dotnet-tools, composer-self, composer-g, symfony-cli, phive
│   ├── jvm/                  # jbang, coursier-cs
│   ├── lang-other/           # gem, opam, hex, mix-archive, luarocks, cabal, stack, nimble, julia, r, flutter, pub-global
│   ├── toolchain/            # mise, asdf, proto, sdkman, goenv
│   ├── cloud/                # az, gcloud, aws-cli-v2, oci, scw, hcloud, linode, doctl, supabase, heroku, railway, flyctl
│   ├── iac/                  # terraform, opentofu, terragrunt, vault, consul, nomad, packer, boundary, tflint, pulumi
│   ├── kubernetes/           # helm, helm-repo, helm-plugins, kubectl, krew, kustomize, flux, argocd, k3d, kind, minikube, skaffold, tilt
│   ├── containers/           # nerdctl, oras, dive, docker-images, docker-desktop, podman-desktop, rancher-desktop
│   ├── security/             # trivy, grype, syft, cosign, rekor, gitsign, nuclei, nuclei-templates, pdtm, semgrep
│   ├── dev-cli/              # lazygit, lazydocker, jj, delta, glab, tea, gh-extensions
│   ├── ide/                  # vscode-ext, cursor-ext, windsurf-ext, vscodium-ext, jetbrains (+ manual-only refs : jetbrains-plugins, zed-ext, sublime-pc, obsidian-plugins, unity-hub, notepad-pp, eclipse-marketplace)
│   ├── editor-plugins/       # nvim-lazy, nvim-packer, nvim-mason, vim-plug
│   ├── embedded-mobile/      # arduino-cli, platformio, android-sdk, expo, fastlane
│   └── shell/                # oh-my-posh, starship, nerd-fonts, pwsh-modules
└── ui/
    ├── table.ts              # cli-table3 wrappers (renderScanTable, renderProvidersStatus)
    ├── scan-progress.ts      # spinner ora + counters [done/total] + in-flight names
    ├── select.ts             # @inquirer/prompts checkbox groupé par provider
    └── retry-failed.ts       # prompt de stratégie de retry post-batch
```

### Principe directeur n°1 : **isolation des providers**

> Un fichier = un provider. **Aucun import croisé** entre providers. Aucun état partagé.

Le but est qu'un provider qui pète (parse cassé sur une nouvelle version de l'outil amont, HTTP timeout, exception non interceptée) **n'affecte que sa propre cellule du tableau**. Concrètement, `scanAll` enveloppe chaque appel `listOutdated()` dans un `try/catch` qui le convertit en `ProviderScanResult.error: string`. Les autres providers continuent de s'exécuter en parallèle.

### Principe directeur n°2 : **shell-out uniquement via `runner.ts`**

> Aucun `child_process` direct. Tout passe par `run()` / `runInherit()`.

Ces wrappers centralisent : encoding UTF-8 forcé (sinon `winget`, `choco` rendent du mojibake sous cp65001), `windowsHide: true`, `reject: false` (jamais de throw sur exit non-zéro), argv-vector explicite (jamais de `shell: true`). Les deux providers qui ont besoin de `shell: true` (Scoop, à cause de son shim PowerShell) sont **pinned par allowlist** dans `tests/security/shell-usage.test.ts`.

### Principe directeur n°3 : **fail-soft, never-throw**

> `listOutdated` et `update` ne **jettent jamais**. Ils retournent `[]` ou `{ success: false, message }`.

Une exception non interceptée dans un provider ferait s'effondrer tout le scan parallèle. Le contrat est : si tu peux pas, retourne vide / failed avec un message clair, mais **ne casse pas la chaîne**.

---

## 4. Cycle de vie complet d'une commande

### 4.1 `gup` (commande nue — menu interactif)

```
1. commander parse argv → aucune sous-commande détectée
   └─> appelle program.action() → menuCommand()  (src/commands/menu.ts)

2. menuCommand() initialise MenuState :
     { scans: [], fast: false, filter: [], detectedCount: 0 }

3. printHeader()  →  ASCII title + version
4. initialScan(state)
     └─> ui/scan-progress.scanWithProgress({ fast, only? })
           ├─ ora spinner "détection des providers…"
           ├─ detectAvailableProviders() : Promise.all(ALL_PROVIDERS.map(p => p.isAvailable()))
           ├─ filter (only / fast)  →  planned[]
           ├─ scanAll({ detected, onProviderStart, onProviderEnd })
           │     └─> pLimit(4) wrappe chaque provider.listOutdated()
           │           ├─ render() live : in-flight set, [done/total], top-3 + "+N"
           │           ├─ catch error → ProviderScanResult.error
           │           └─ filtre `pkg.manual === true`
           └─ spinner.stopAndPersist(`scan terminé en Xs — N providers, M maj`)

5. Boucle infinie du menu :
     printStatus(state)  →  "K provider(s) détecté(s) · M mise(s) à jour"
     select<MenuAction>  →  Scan / Review / Update selected / Update all
                              / Update target / Providers / Options / Quit

   Chaque action :
     - Scan      → initialScan(state)  (rescanne)
     - Review    → renderScanTable(state.scans)
     - select    → ui/select.promptPackageSelection(state.scans)
                   ├─ checkbox groupé par provider
                   ├─ confirm "Appliquer N mises à jour ?"
                   ├─ groupe par providerId → provider.updateAll(pkgs) (ou .update si 1)
                   ├─ maybeRetryFailures(entries) (cf. §10)
                   └─ summarize(outcomes)
                   puis rescanne
     - all       → confirm → boucle sur scans → provider.updateAll → retry → summarize → rescanne
     - target    → input "provider:packageId, espace/virgule" → boucle .update
     - doctor    → renderProvidersStatus(detected, missing)
     - options   → toggle fast / filtre par providers (checkbox)
     - quit      → return 0
```

### 4.2 `gup list`

```
listCommand({ only?, fast?, json? })
  ├─ if json → scanAll() pur, JSON.stringify(results)
  └─ else    → scanWithProgress() + renderScanTable()
```

Pas de prompt, pas d'écriture, sortie sur stdout. Exit code 0 toujours (list ne *fait* rien, sauf erreur catastrophique).

### 4.3 `gup update [targets...]`

Trois chemins :

```
updateCommand({ all, yes, only, fast, targets })

(a) targets fournis :
    → runTargets(targets)
        └─ split "provider:packageId" → getProvider → provider.update(packageId)
        → maybeRetryFailures → summarize
    SHORTCUT : skip complet du scan.

(b) all + yes :
    → scanWithProgress
    → selection = TOUS les packages
    → groupe par provider → provider.updateAll
    → retry → summarize → exit code (0 si rien failed, 1 sinon)

(c) ni all ni targets :
    → scanWithProgress
    → promptPackageSelection (checkbox interactif)
    → groupe par provider → provider.updateAll
    → retry → summarize
```

### 4.4 `gup doctor`

```
doctorCommand()
  ├─ Promise.all(ALL_PROVIDERS.map(p => ({ p, ok: await p.isAvailable() })))
  ├─ detected = ok'd providers
  ├─ missing  = !ok'd, avec installHint
  └─ renderProvidersStatus(detected, missing)
```

Pas de scan, pas d'update : ça répond uniquement à la question "qu'est-ce qui est détectable sur cette machine, et comment installer ce qui manque ?".

---

## 5. Le contrat **Provider** — anatomie détaillée

Le cœur de `gup`. Toute la valeur du projet réside dans la qualité et l'isolation des ~130 implémentations de cette interface.

```ts
export interface Provider {
  readonly id: string;            // kebab-case, unique, stable (clé CLI)
  readonly displayName: string;   // affiché en table / menu — court, sans marketing
  readonly installHint?: string;  // affiché par `gup doctor` quand non détecté
  readonly slow?: boolean;        // true ↔ HTTP-per-package, walk FS lourd, etc.

  isAvailable(): Promise<boolean>;
  listOutdated(): Promise<OutdatedPackage[]>;
  update(packageId: string, options?: UpdateOptions): Promise<UpdateOutcome>;
  updateAll(packages: OutdatedPackage[], options?: UpdateOptions): Promise<UpdateOutcome[]>;
}
```

### 5.1 `isAvailable()` — la détection

Doit retourner **rapidement**. Stratégie standard : `commandExists("<binary>")`, qui sous le capot fait `where <bin>` (Windows) / `which <bin>` (POSIX). Coût ~quelques ms.

Cas particuliers :
- Providers qui dépendent d'un **dossier de config** plutôt que d'un binaire (ex. `nvim-lazy` détecte `~/.local/share/nvim/lazy` ou équivalent Windows) utilisent `access()` de `node:fs/promises`.
- Providers WSL : ils sont disponibles si `wsl.exe` répond, **et** si une distro tournant un PM cible est listée. Voir `src/core/wsl.ts`.

### 5.2 `listOutdated()` — le scan

C'est la méthode la plus complexe et la plus variable. Le contrat :

1. **Ne jamais throw.** En cas d'erreur de parsing, de timeout HTTP, de PM cassé : return `[]`.
2. **Output uniquement les paquets vraiment obsolètes.** `current === latest` doit être filtré.
3. Construire chaque `OutdatedPackage` avec :
   - `id` : identifiant utilisable par `update(id)` (provider-local ; pas besoin d'être global-unique).
   - `name?` : nom human-readable si différent de l'id.
   - `current` / `latest` : strings tels que sortis du PM, **non normalisés** (l'UI les affiche tels quels — la comparaison sémantique est faite côté provider via `normalizeVersion()`).
   - `note?` : info supplémentaire libre (`"pinned"`, `"unknown version"`, `"source: msstore"`…).
   - `manual?: true` : signale que l'update demandera une action humaine. Filtré par `scanAll` → invisible à l'utilisateur, **mais reste visible dans la décision "à montrer ou pas"**. Patterns d'usage : JetBrains Toolbox, plugins behind GUI, packages App Installer (winget itself).

#### Pattern A : le PM expose du JSON

Le bonheur. Exemple `NpmGlobalProvider` :

```ts
const { stdout } = await run("npm", ["outdated", "-g", "--json", "--long"]);
const parsed = JSON.parse(stdout) as Record<string, NpmOutdatedEntry>;
return Object.entries(parsed)
  .filter(([, info]) => info.current && info.latest && info.current !== info.latest)
  .map(([name, info]) => ({ id: name, name, current: info.current!, latest: info.latest! }));
```

Pas de regex, pas de parsing positionnel.

#### Pattern B : le PM ne sort que du texte tabulaire

`WingetProvider`, `ScoopProvider`. La technique : repérer la **ligne d'en-tête** ("Name Installed Version Latest Version"), calculer les offsets de colonnes par position de chaque header, puis slicer chaque ligne sur ces offsets. Résistant aux libellés localisés (FR/EN).

```ts
const headerIdx = lines.findIndex((l) => /^\s*Name\s+Installed Version\s+Latest Version/i.test(l));
// puis pour chaque ligne au-delà du séparateur :
const parts = line.trim().split(/\s{2,}/);  // ≥ 2 espaces = nouvelle colonne
```

#### Pattern C : le PM n'a pas de "list outdated", mais expose `--version`

Cas typique des outils HashiCorp, des CLIs cloud, de la plupart des outils dev (`lazygit`, `jj`, `delta`…). Le provider :

1. Lit la version installée via `<bin> --version`.
2. Va chercher la version upstream via une API (GitHub Releases, HashiCorp Checkpoint, npm registry, PyPI…).
3. Compare avec `normalizeVersion()` (trim leading `v`, lowercase).
4. Génère **au plus une** entrée `OutdatedPackage` (un seul "paquet" à mettre à jour : l'outil lui-même).
5. `update()` délègue à un PM hôte via `delegateUpdate()` (`core/install-source.ts`).

Exemple condensé (`SelfProvider` pour `gh`) :

```ts
{
  id: "gh", displayName: "GitHub CLI", binary: "gh",
  current: async () => parseFirstSemver(await runStdout("gh", ["--version"])),
  latest: async () => fetchGitHubReleaseLatest("cli/cli"),
  update: async () => delegateUpdate({
    id: "gh", binary: "gh",
    packageIds: { winget: "GitHub.cli", scoop: "gh", choco: "gh" },
    manualMessage: "Télécharger https://github.com/cli/cli/releases et remplacer gh.exe",
  }),
}
```

Tous ces providers sont **flaggés `slow = true`** (un appel HTTP par scan).

#### Pattern D : `helm repo update` + `helm search repo --versions` (Kubernetes/Helm)

Helm est sui generis : pas de "outdated" intégré. La technique consiste à `helm repo update` (refresh local), puis pour chaque release installée comparer la version locale au champ `version` de `helm search repo <chart> --versions -o json`. C'est cher → flaggé `slow`.

#### Pattern E : Bridge WSL

Les providers `wsl-apt`, `wsl-dnf`, `wsl-pacman`, etc. fonctionnent en encapsulant `wsl.exe -d <distro> -- <command-linux>`. Le helper `src/core/wsl.ts` gère :
- Détection des distros disponibles (`wsl.exe -l -q`).
- Sélection : si plusieurs distros tournent le même PM, lister par distro et donner un id composé (`apt:<distro>:<pkg>`).

### 5.3 `update(packageId, options?)` — un paquet

Reçoit un `packageId` (issu de `OutdatedPackage.id` ou typé à la main par l'utilisateur) et retourne **toujours** un `UpdateOutcome` :

```ts
interface UpdateOutcome {
  id: string;
  success: boolean;
  skipped?: boolean;    // ran out gracefully, action humaine requise
  message?: string;     // raison de l'échec / du skip
  retryable?: boolean;  // pourrait passer avec une stratégie plus agressive
}
```

`UpdateOptions` :

```ts
interface UpdateOptions {
  force?: boolean;              // bypass hash check (ex. winget --force)
  uninstallPrevious?: boolean;  // ex. winget --uninstall-previous (destructif)
  reinstall?: boolean;          // dernier recours : uninstall + install en 2 commandes
}
```

Ces flags ne sont JAMAIS positionnés par `gup` lui-même au premier passage. Ils sont activés uniquement par l'**utilisateur explicitement**, via le menu de retry post-batch (`ui/retry-failed.ts`). Voir §10.

L'implémentation typique :

```ts
async update(packageId: string, options?: UpdateOptions): Promise<UpdateOutcome> {
  const args = ["upgrade", "--id", packageId, "--exact", "--silent",
                "--accept-package-agreements", "--accept-source-agreements",
                "--include-unknown"];
  if (options?.force) args.push("--force");
  if (options?.uninstallPrevious) args.push("--uninstall-previous");
  const res = await runInherit("winget", args);
  return res.failed
    ? { id: packageId, success: false, retryable: true }
    : { id: packageId, success: true };
}
```

Notes :
- `runInherit` **stream le stdout/stderr du sous-process directement dans le terminal de l'utilisateur**. C'est volontaire : pendant un update on veut voir les barres de progression, les questions interactives (winget peut demander l'acceptation d'une EULA), les warnings.
- Ne pas confondre avec `run()`, qui capture stdout/stderr en mémoire (utilisé pour parser dans `listOutdated`).

### 5.4 `updateAll(packages, options?)` — bulk

Quand le PM supporte un upgrade groupé natif, le provider l'utilise et **mappe le résultat unique** à autant d'`UpdateOutcome` que de paquets :

```ts
// npm-global : un seul `npm install -g pkg1@latest pkg2@latest …`
async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
  const args = ["install", "-g", ...packages.map((p) => `${p.id}@latest`)];
  const res = await runInherit("npm", args);
  return packages.map((p) => ({ id: p.id, success: !res.failed }));
}
```

Quand le PM ne supporte pas le bulk (cas de `SelfProvider`, certains providers GitHub-Release-driven), `updateAll` boucle simplement sur `update`.

### 5.5 `manual: true` vs `skipped: true`

Deux concepts orthogonaux qu'il faut bien distinguer :

- **`manual: true`** est posé sur un `OutdatedPackage` par `listOutdated`. Signifie : "ce paquet est obsolète, mais je sais déjà qu'aucune commande automatique ne marchera (GUI-only, store Microsoft, etc.)". `scanAll` les **filtre dès le scan** (`packages.filter(pkg => !pkg.manual)`) — l'utilisateur ne les voit jamais. Les providers qui ne produisent **que** des items `manual` sont retirés du registry pour ne pas plomber le temps de scan (cf. les commentaires dans `src/core/registry.ts` autour de `jetbrains-plugins`, `zed-ext`, etc.).
- **`skipped: true`** est posé sur un `UpdateOutcome` par `update()`. Signifie : "j'ai essayé, j'ai détecté en cours de route qu'une condition humaine manquait (par exemple : pas d'élévation admin), j'arrête sans rien casser". L'utilisateur le voit en jaune `SKIP` distinct du rouge `FAIL`.

---

## 6. Le moteur de scan — `core/registry.ts`

### 6.1 `ALL_PROVIDERS`

Une simple liste statique d'instances. L'ordre dans la liste **dicte l'ordre d'affichage** dans `gup doctor` et dans la table de scan. Organisée par catégorie pour lisibilité.

```ts
export const ALL_PROVIDERS: Provider[] = [
  new WingetProvider(), new ScoopProvider(), new ChocoProvider(),
  new WslProvider(), new WslAptProvider(), /* ... */
  new NpmGlobalProvider(), /* ... */
  // ~130 entrées au total
  new SelfProvider(), // toujours en dernier
];
```

### 6.2 `detectAvailableProviders()`

```ts
const checks = await Promise.all(
  ALL_PROVIDERS.map(async (p) => ({ p, ok: await p.isAvailable() })),
);
return checks.filter((c) => c.ok).map((c) => c.p);
```

Probe complet, en parallèle, sans pLimit (les `commandExists` sont des `where`/`which`, ms-cheap, le coût est de toute façon dominé par le binaire le plus lent à répondre — typiquement `wsl.exe -l -q`).

### 6.3 `getProvidersToScan(options)`

Filtre `ALL_PROVIDERS` :

```ts
return available.filter((p) => {
  if (options.only?.length && !options.only.includes(p.id)) return false;  // --provider winget npm-g
  if (options.fast && p.slow) return false;                                 // --fast
  return true;
});
```

Le `options.detected` permet à l'UI qui a déjà tourné `detectAvailableProviders()` (le spinner "détection des providers…") de ne pas la refaire.

### 6.4 `scanAll(options)` — l'orchestrateur

```ts
const limit = pLimit(options.concurrency ?? 4);
return Promise.all(
  filtered.map((p) =>
    limit(async (): Promise<ProviderScanResult> => {
      options.onProviderStart?.(p);
      let result: ProviderScanResult;
      try {
        const all = await p.listOutdated();
        const packages = all.filter((pkg) => !pkg.manual);
        result = { providerId: p.id, available: true, packages };
      } catch (err) {
        result = {
          providerId: p.id, available: true, packages: [],
          error: err instanceof Error ? err.message : String(err),
        };
      }
      options.onProviderEnd?.(p, result);
      return result;
    }),
  ),
);
```

Trois invariants posés ici :
1. **Concurrency 4 par défaut.** Le but est de ne pas saturer la machine de subprocess et de garder la sortie spinner lisible. Configurable via `concurrency`.
2. **Le `try/catch` est dans `scanAll`, pas dans le provider.** Le provider est libre de lever, scanAll absorbe. C'est la dernière ligne de défense.
3. **`pkg.manual` est filtré ici, une seule fois.** Aucun code en aval n'a besoin de savoir que `manual` existe (sauf les rares providers qui les produisent eux-mêmes en interne).

---

## 7. Le runner — `core/runner.ts`

Toute interaction avec le système se fait via 5 fonctions de ce fichier.

```ts
// 1. Capture stdout/stderr en mémoire — utilisé par listOutdated() pour parser
async function run(command, args = [], options = {}): Promise<RunResult>

// 2. Stream stdout/stderr vers le terminal user — utilisé par update() pour qu'il voie l'install tourner
async function runInherit(command, args = [], options = {}): Promise<RunResult>

// 3. `where <bin>` / `which <bin>` — utilisé partout dans isAvailable()
async function commandExists(command): Promise<boolean>

// 4. Première résolution PATH d'un binaire — utilisé quand l'emplacement compte (ex. corepack-ownership)
async function whichFirst(command): Promise<string | null>

// 5. Probe d'élévation Windows (`net session`) — utilisé par les providers admin-required (choco)
async function isElevated(): Promise<boolean>
```

### Décisions clés

- **`reject: false`** : execa par défaut throw sur exit non-zéro. Ici on inspecte `failed` à la main. Évite de devoir wrapper chaque appel dans un try/catch.
- **`encoding: "utf8"`** sur `run()` : sans ça, Windows en cp65001 retourne du mojibake (`winget`, `choco` particulièrement). Cassait le parsing des tables.
- **`windowsHide: true`** : sinon chaque subprocess ouvre brièvement une fenêtre cmd qui clignote. Cosmétique mais essentiel pour l'UX.
- **Pas de `shell: true` par défaut.** L'argv vector empêche l'injection. Les deux exceptions (Scoop : son shim PowerShell ne s'invoque pas autrement) sont **allowlistées par un test sécurité** (`tests/security/shell-usage.test.ts`) : si un nouveau provider veut faire `shell: true`, le test casse.

### `RunResult`

```ts
interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  failed: boolean;  // true si exitCode !== 0 OU si execa a flaggé failed (timeout, signal, etc.)
}
```

Volontairement plat. Pas de "value" / "ok" sucre. Lisible direct.

---

## 8. Helpers transverses (`core/`)

### 8.1 `gh-releases.ts`

Pattern le plus fréquent dans `gup` : "ce paquet vient de GitHub, va chercher le tag de la dernière release et compare-le à `<bin> --version`".

```ts
fetchGitHubReleaseLatest(ownerRepo, { stripVPrefix = true, timeoutMs = 5000 })
fetchGitHubReleaseTagMatching(ownerRepo, predicate, opts) // pour kustomize, k3d : tags préfixés
normalizeVersion(v)  // strip "v", lowercase, trim
```

Toutes ces fonctions retournent `null` en cas d'erreur réseau / HTTP : **pas de throw**. Le provider qui les utilise traite `null` comme "skip cette entrée du scan".

Timeout 5 s par défaut, borné par `AbortSignal.timeout(5_000)`. Crucial : sans ça, un seul GitHub API timeout pourrait bloquer un scan parallèle entier (avec concurrency=4, la pile attend le slot).

### 8.2 `hashicorp-releases.ts`

Équivalent pour Terraform / Vault / Consul / Nomad / Packer / Boundary. Utilise l'endpoint `https://api.releases.hashicorp.com/v1/releases/<product>/latest` qui n'a pas de rate-limit GitHub.

### 8.3 `wsl.ts`

Détecte les distros WSL (`wsl -l -q`), invoque des commandes Linux à travers `wsl -d <distro> -- bash -c "<cmd>"`. Utilisé par les 7 providers `wsl-*`.

### 8.4 `install-source.ts`

Heuristique inverse : étant donné un binaire sur PATH, deviner quel PM l'a installé (basé sur le chemin résolu — `%LOCALAPPDATA%\Microsoft\WinGet\Packages\…` → winget, `~\scoop\…` → scoop, etc.). Exposé via `delegateUpdate()`, utilisé par les providers qui ne s'auto-updatent pas et doivent re-router vers leur PM hôte (ex. `gh`).

### 8.5 `corepack-ownership.ts`

Cas tordu spécifique à pnpm / yarn. Modern pnpm/yarn peuvent être :
- Installés directement (`pnpm self-update`, `npm i -g yarn`),
- Ou shimmés par corepack (`corepack prepare pnpm@latest --activate`).

Le binaire visible sur PATH peut être l'un ou l'autre. La détection regarde si le chemin du binaire est dans le répertoire corepack. `SelfProvider` utilise ça pour éviter de proposer un `pnpm self-update` qui ne marcherait pas si pnpm est un shim corepack — c'est `CorepackProvider` qui doit s'en charger.

### 8.6 `nvim-paths.ts`

Localise les répertoires Neovim selon l'OS (`XDG_DATA_HOME`, `%LOCALAPPDATA%\nvim-data`, etc.) pour les providers `nvim-lazy`, `nvim-packer`, `nvim-mason`.

---

## 9. Les commandes — `commands/`

### 9.1 `cli.ts` — l'entrée

Pure orchestration commander. 5 entry points (par défaut + 4 sous-cmds). Chaque action `await`s un `*Command()` qui retourne un exit code, puis `process.exit(code)`. Catch global :
- `ExitPromptError` (Ctrl+C dans un prompt @inquirer) → silent, exit 130 (convention POSIX SIGINT).
- Autre exception → `chalk.red("Error:")` + message + exit 1.

### 9.2 `list.ts`

Mince. Soit JSON pipeable (`--json` → `scanAll` brut → `JSON.stringify`), soit table colorisée (`scanWithProgress` + `renderScanTable`). Toujours exit 0.

### 9.3 `update.ts`

Trois branches selon les options (cf. §4.3). Important : le code groupe `selection` par `providerId` avant d'invoquer `provider.updateAll(pkgs)` pour bénéficier du bulk natif quand dispo.

### 9.4 `doctor.ts`

Probe seulement, pas de scan. Sortie `renderProvidersStatus(detected, missing)`. Pas de `--json` (volontaire — c'est une commande de diagnostic interactive, pas une primitive scriptable ; pour ça utiliser `gup list --json`).

### 9.5 `menu.ts`

Le mode "default". REPL en `for(;;)`. Maintient un `MenuState` partagé entre itérations :
- `scans` : derniers résultats du scan (réutilisés tant que pas de rescanne).
- `fast` : flag mode rapide.
- `filter` : liste de providers à scanner (vide = tous).
- `detectedCount` : nombre de providers détectés (affiché dans la barre de status).

Le menu invalide `scans` après chaque update batch (auto-rescanne) → l'utilisateur voit immédiatement les paquets qui sont passés à jour disparaître de la liste.

---

## 10. Stratégies de retry — `ui/retry-failed.ts`

Spécifique à `winget` mais conçu générique. Le problème : `winget upgrade` peut échouer pour plusieurs raisons réversibles avec une commande plus agressive :

- Mismatch de hash d'installeur → `--force` ignore la vérification.
- Changement de technologie d'install (MSI → MSIX) ou version courante "Unknown" → `--uninstall-previous` désinstalle d'abord.
- Cas où même `--uninstall-previous` ne se déclenche pas → exécuter `winget uninstall` puis `winget install --force` en deux commandes séparées.

### Mécanisme

1. Chaque provider qui peut être dans ce cas retourne `{ success: false, retryable: true }` sur son premier échec.
2. À la fin du batch, `maybeRetryFailures(entries)` regarde si au moins une entry est `retryable`.
3. Si oui, présente à l'utilisateur (et lui SEUL — jamais en mode `--yes`) un `select` avec 3 stratégies progressivement plus agressives :
   - `--force` (sûr — n'altère que la vérif SHA).
   - `--force --uninstall-previous` (destructif — peut perdre la config app hors `%APPDATA%`).
   - `uninstall + install` en 2 étapes (dernier recours — même destructivité).
4. L'utilisateur choisit "Aucun" pour laisser l'échec, ou une stratégie pour réessayer **tous** les retryables.
5. La fonction se rappelle elle-même avec la stratégie déjà tentée **exclue** des choix suivants. Garantie d'absence de boucle infinie.

### Pourquoi cette structure

- **Opt-in explicite** : `--force` désactive la vérif d'intégrité, donc on ne le déclenche jamais sans confirmation humaine.
- **Mode CI safe** : `-y / --yes` court-circuite tout retry. Acceptable : si un winget échoue en CI, on veut le voir.
- **Progression unique** : la liste des stratégies déjà tentées est portée dans la récursion (`excludeStrategies`). Pas d'état global, pas de file mutable.

---

## 11. La couche UI — `ui/`

### 11.1 `table.ts`

Wrap `cli-table3`. Deux helpers :
- `renderScanTable(results)` : Provider · Package · Current · Latest · Note. Tri lexicographique par providerId. Errors de scan affichées en rouge inline. Totalise les updates en bas.
- `renderProvidersStatus(detected, missing)` : double liste à puces vertes (●) / grises (○). Les missing affichent leur `installHint`.

### 11.2 `scan-progress.ts`

L'élément le plus user-facing. Utilise `ora` (spinner Unicode) + état local pour rendre :

```
⠋ scan [12/47] — npm (global) · pip · Helm  +5
```

Mécanique : `inFlight = new Set<string>()`. `onProviderStart` ajoute le `displayName`, `onProviderEnd` le retire. À chaque event, `render()` reconstruit la chaîne avec les 3 premiers + "+N" si overflow. Sur erreur, persist temporairement le message avant le prochain render.

À la fin, un `stopAndPersist` affiche le résumé : durée, nombre de providers, nombre d'updates.

### 11.3 `select.ts`

Wraps `@inquirer/prompts.checkbox` mais avec un layout **grouped by provider**. Sépare chaque groupe par un `Separator`, indente les paquets, affiche le note en gris à droite.

### 11.4 `retry-failed.ts`

Couvert §10.

---

## 12. Mode `--fast`

Beaucoup de providers font du HTTP par paquet (helm-search, vscode-ext, pwsh-modules, self) ou du filesystem walk lourd. Sur une machine bien remplie, un scan complet peut prendre 30–60 secondes.

`--fast` (ou `Options → Fast mode ON` dans le menu) **exclut tous les providers `slow = true`** de la liste à scanner. Ramène typiquement le scan à <5 secondes.

C'est **un flag déclaratif sur le provider**, pas une allowlist centralisée. Ajouter un provider slow demande juste d'écrire `readonly slow = true` dans la classe — pas de modification de `registry.ts`.

Liste typique des `slow`s : `pwsh-modules` (PowerShell Gallery HTTP per module), `vscode-ext` (GitHub Marketplace), `helm-repo` (`helm repo update`), `pip` (PyPI HTTP per package), `self` (npm/PyPI/GitHub per PM), tous les providers IaC HashiCorp (release feed), Helm chart providers, etc.

---

## 13. Catalogue providers (snapshot)

Source canonique : [`docs/providers-catalog.md`](./providers-catalog.md). Distribution actuelle (~130 entrées) :

| Catégorie | # | Représentants |
|---|---:|---|
| OS / Windows | 3 | winget, scoop, choco |
| WSL | 7 | wsl, wsl-apt, wsl-dnf, wsl-pacman, wsl-brew, wsl-flatpak, wsl-nix |
| Node.js / JS | 9 | npm-g, pnpm-g, yarn-g, bun-g, deno, corepack, fnm, volta, nvm-windows |
| Python | 8 | pip, pipx, uv-tools, poetry, pdm, rye, pyenv-win, conda |
| .NET / PHP | 5 | dotnet-tools, composer-self, composer-g, symfony-cli, phive |
| JVM | 2 | jbang, coursier-cs |
| Rust | 2 | rustup, cargo |
| Autres langages | 12 | gem, opam, hex, mix-archive, luarocks, cabal, stack, nimble, julia-pkg, r-packages, flutter, pub-global |
| Polyglot toolchain | 5 | mise, asdf, proto, sdkman, goenv |
| Cloud CLIs | 12 | az, gcloud, aws, oci, scw, hcloud, linode, doctl, supabase, heroku, railway, flyctl |
| IaC | 10 | terraform, opentofu, terragrunt, vault, consul, nomad, packer, boundary, tflint, pulumi |
| Kubernetes / Helm | 13 | helm, helm-repo, helm-plugins, kubectl, krew, kustomize, flux, argocd, k3d, kind, minikube, skaffold, tilt |
| Containers | 7 | nerdctl, oras, dive, docker-images, docker-desktop, podman-desktop, rancher-desktop |
| Security scanning | 10 | trivy, grype, syft, cosign, rekor, gitsign, nuclei, nuclei-templates, pdtm, semgrep |
| Dev CLIs | 7 | lazygit, lazydocker, jj, delta, glab, tea, gh-extensions |
| IDEs / Extensions | 5 | vscode-ext, cursor-ext, windsurf-ext, vscodium-ext, jetbrains |
| Editor plugins | 4 | nvim-lazy, nvim-packer, nvim-mason, vim-plug |
| Embedded / Mobile | 5 | arduino-cli, platformio, android-sdk, expo, fastlane |
| Shell / cosmetic | 4 | oh-my-posh, starship, nerd-fonts, pwsh-modules |
| Meta | 1 | self (auto-MAJ des PM eux-mêmes) |

Le doc `providers-catalog.md` détaille pour chacun : ID, source upstream, statut (✅ intégré, 🚧 code présent / non câblé car manual-only, ⬜ candidat, ➡️ absorbé, ❌ hors scope).

---

## 14. Cas particuliers notables

### 14.1 `WingetProvider` — parsing de table localisé

Winget n'a pas de mode JSON pour `upgrade`. Le provider :
1. Lit `winget upgrade --include-unknown --accept-source-agreements`.
2. Cherche la ligne d'en-tête par regex tolérante à la langue.
3. Calcule les offsets de colonnes à partir des positions des headers.
4. Slice chaque ligne sur ces offsets.
5. Croise avec la liste `winget pin list` pour annoter `pinned`.
6. Marque `note: "unknown version"` si la version courante est `<` (sentinelle winget pour "version inconnue").

L'update accepte 3 niveaux progressifs (force, force+uninstall-previous, reinstall en 2 étapes), tous derrière `UpdateOptions`. Chaque échec lève le flag `retryable: true` pour que `maybeRetryFailures` puisse proposer le niveau supérieur.

### 14.2 `ScoopProvider` — l'exception `shell: true`

Scoop est en réalité un script PowerShell (`scoop.ps1` exposé via le shim `scoop.cmd`). Pour qu'execa l'invoque correctement sur Windows, il faut `shell: true`. Le risque d'injection est neutralisé par :
1. Une regex de validation stricte sur le packageId : `^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)?$` (charset Scoop).
2. Un test sécu (`tests/security/shell-usage.test.ts`) qui pin la liste exhaustive des appels `shell: true` dans le codebase. Toute nouvelle utilisation casse la CI.

### 14.3 `SelfProvider` — méta-update des PM

Surface les "Le PM lui-même est obsolète". Couvre winget, scoop, choco, npm, pnpm, yarn, pip, pipx, gh. Pour chacun :
1. `current()` : parse `<bin> --version` avec une regex semver tolérante.
2. `latest()` : fetch upstream (npm registry, PyPI, GitHub Releases selon le PM).
3. `update()` : commande canonique documentée (`scoop update`, `npm install -g npm@latest`, `corepack prepare yarn@stable --activate`, `pipx upgrade pipx`, …).

Trois ownership quirks gérés :
- **pnpm / yarn corepack-owned** : si le binaire est un shim corepack, `SelfProvider` skip ce target (c'est `CorepackProvider` qui s'en charge via `corepack prepare`).
- **pip Windows multi-Python** : la résolution de l'interpréteur cible se fait à partir du chemin physique de `pip.exe` (pas via `py -m pip`), pour garantir qu'on update l'install que PATH résout.
- **gh** : pas de `self update`. Delegation à `winget` / `scoop` / `choco` via `install-source.ts`.

### 14.4 Manual-only providers retirés du registry

Les providers `jetbrains-plugins`, `zed-ext`, `sublime-pc`, `obsidian-plugins`, `unity-hub`, `notepad-pp`, `eclipse-marketplace` existent comme **code** dans `src/providers/ide/` mais ne sont **pas** dans `ALL_PROVIDERS`. Raison : tous leurs items sortent `manual: true`, et donc `scanAll` les filtrerait à 100%. Les laisser dans le registry ajouterait du temps de scan sans bénéfice UI. Le code est conservé en référence pour un futur où un chemin d'update automatisable apparaîtrait.

---

## 15. Sécurité

Surface d'attaque significative (shell-out sur ~130 outils tiers). Voir `SECURITY.md`.

### Threat model

1. **Command injection via package id hostile** (manifest amont compromis, registry réponse poisoneuse).
   - Mitigation : argv-vector partout, `shell: true` allowlisté + validation regex sur les packageId qui s'en servent.
2. **MITM sur les probes de version upstream**.
   - Mitigation : tous les `fetch()` doivent cibler `https://`. Pinned par `tests/security/http-targets.test.ts`.
3. **Provider mis-routing**.
   - `install-source.inferSourceFromPath` décide quel PM possède un binaire ; misclassification = upgrade vers la mauvaise source.
   - Pinned par `tests/security/install-source.test.ts`.

### Outillage

| Layer | Outil | Config |
|---|---|---|
| Static SAST | CodeQL `security-extended` + `security-and-quality` | `.github/workflows/security.yml` |
| Custom SAST | Semgrep + `p/typescript` + `p/nodejs` | `.semgrep.yml` |
| Secrets | gitleaks | `.gitleaks.toml` |
| Dep vulns | `audit-ci` (CI) + Dependabot weekly grouped | `audit-ci.json`, `.github/dependabot.yml` |
| Lint | `eslint-plugin-security` | `.eslintrc.security.cjs` |
| Custom pins | Vitest security suite | `tests/security/*.test.ts` |

`npm run security` enchaîne `audit:deps:ci` + `lint:security` + `test:security`.

---

## 16. Tests

Stack : Vitest + v8 coverage. CI cross-platform : Ubuntu + Windows × Node 20 + Node 22.

```bash
npm run typecheck             # tsc strict + noUncheckedIndexedAccess + exactOptionalPropertyTypes
npm run test                  # watch
npm run test:run              # one-shot
npm run test:coverage         # + coverage report
npm run test:security         # suite sécu seule
npm run lint                  # eslint
```

Trois types de tests :
1. **Unit** : parsers de chaque provider (winget table, scoop status, npm outdated JSON, helm search…), helpers (`gh-releases.ts`, `install-source.ts`, `normalizeVersion`).
2. **Security pins** : `shell-usage.test.ts` (allowlist des `shell: true`), `http-targets.test.ts` (https-only), `install-source.test.ts` (mappings binaire ↔ PM).
3. **Integration** : très limités — la CLI shell-out sur des outils réels qui peuvent ne pas être installés en CI.

Conventions strictes : `tsconfig.json` active `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`. Pas de cast `as` sauf nécessité, pas de `any`. Code review : "no comments stating WHAT, only WHY when non-obvious".

---

## 17. Build & distribution

### Stack

- TypeScript ESM, `tsconfig.json` strict.
- Bundler : `tsup` (config minimale, single bundle, `dist/cli.js`).
- Pas de publication npm (`"private": true` dans `package.json`). Distribution = `git clone` + `npm install && npm run build && npm link`.

### Scripts npm

```
dev              # tsx src/cli.ts (no-build dev loop)
build            # tsup → dist/
start            # node dist/cli.js
typecheck        # tsc --noEmit
test, test:run, test:security, test:coverage, test:coverage:ci
lint, lint:security
audit:deps, audit:deps:ci
security         # composite : audit + lint sécu + tests sécu
```

### Pourquoi pas npm-publish ?

Choix conscient :
1. La cible est une station de dev personnelle, pas un package consommé par d'autres projets.
2. La forme distribuée serait sensiblement la même que le source (un seul binaire, pas de lib publique).
3. `npm link` après `git clone` reste la voie la plus simple à auditer pour un nouvel utilisateur.

---

## 18. Étendre `gup` — ajouter un provider en pratique

Cf. `CONTRIBUTING.md`. Workflow type :

```powershell
# 1. Copie du template
Copy-Item src/providers/_template.ts src/providers/<category>/<your-provider>.ts

# 2. Édite la classe : id, displayName, installHint, slow?
#    Implémente isAvailable(), listOutdated(), update(), updateAll().

# 3. Enregistre dans src/core/registry.ts (import + entry dans ALL_PROVIDERS).

# 4. Smoke test
npm run typecheck
npx tsx src/cli.ts doctor
npx tsx src/cli.ts list --provider my-tool
```

Conventions à respecter :
- Un fichier = un provider. Aucun import croisé entre providers.
- Aucun throw dans `listOutdated`/`update`/`updateAll`. Return `[]` ou `success: false`.
- Toujours via `run` / `runInherit`. Jamais `child_process` direct.
- `fetch` toujours borné par `AbortSignal.timeout(5_000)`.
- `slow: true` si le scan fait du HTTP-par-paquet ou du walk FS.
- `skipped: true` quand l'update demande une action humaine.
- TypeScript strict, pas de cast inutile.
- User-facing strings en français (cible principale FR), code/identifiers en anglais.

---

## 19. Synthèse — la mental map en une phrase

> **`gup`** est une **CLI orchestratrice** qui agrège ~130 **Providers** (un fichier = une source d'installation), chacun implémentant un contrat à 4 méthodes (`isAvailable` / `listOutdated` / `update` / `updateAll`) ; les Providers sont **fan-out scannés** en parallèle via `pLimit(4)` derrière un spinner live ; les résultats sont **fail-soft** (un provider qui casse n'affecte que sa cellule) ; les updates sont **stream-inherit** vers le terminal user ; les échecs récupérables passent par un menu de **retry progressivement agressif** opt-in ; toute la surface shell-out est verrouillée par tests sécurité + SAST + audit dépendances + secret scanning.

---

## Annexe A — Tableau récapitulatif des contrats

| Concept | Type | Lieu | Invariant |
|---|---|---|---|
| `Provider.id` | `string` (kebab-case) | classe provider | unique sur `ALL_PROVIDERS`, stable |
| `Provider.slow` | `boolean?` | classe provider | déclaratif ; gated par `--fast` |
| `OutdatedPackage.manual` | `boolean?` | output `listOutdated` | filtré dans `scanAll`, jamais visible user |
| `UpdateOutcome.success` | `boolean` | output `update` | `false` ↔ échec OU skip |
| `UpdateOutcome.skipped` | `boolean?` | output `update` | `success: false` requis ; jaune SKIP |
| `UpdateOutcome.retryable` | `boolean?` | output `update` | `success: false` requis ; déclenche menu retry |
| `UpdateOptions.force` | `boolean?` | input `update` | jamais setté par défaut, opt-in user only |
| `UpdateOptions.uninstallPrevious` | `boolean?` | input `update` | destructif, opt-in user only |
| `UpdateOptions.reinstall` | `boolean?` | input `update` | destructif, dernier recours, opt-in user only |
| `ScanOptions.concurrency` | `number?` | input `scanAll` | défaut 4 |
| `ScanOptions.only` | `string[]?` | input `scanAll` | restriction par provider id |
| `ScanOptions.fast` | `boolean?` | input `scanAll` | skip les `slow` |

---

## Annexe B — Mapping commande utilisateur → code

| Commande user | Entry | Logique |
|---|---|---|
| `gup` | `program.action` | `menuCommand()` REPL |
| `gup list` | `program.command("list")` | `listCommand()` |
| `gup list --json` | idem | bypass renderScanTable, `JSON.stringify(scanAll)` |
| `gup list --fast` | idem | `fast: true` passé à `scanWithProgress` |
| `gup list --provider winget npm-g` | idem | `only: ["winget", "npm-g"]` |
| `gup update` | `program.command("update")` | `updateCommand()` → checkbox interactif |
| `gup update --all` | idem | tous les paquets scannés sélectionnés |
| `gup update --all -y` | idem | + skip confirm + skip retry menu |
| `gup update winget:Microsoft.PowerShell` | idem | `runTargets(["winget:Microsoft.PowerShell"])` ; pas de scan |
| `gup doctor` | `program.command("doctor")` | `doctorCommand()` |
| Ctrl+C dans un prompt | catch global | `ExitPromptError` → exit 130 |
| Erreur fatale | catch global | `chalk.red("Error:")` + exit 1 |

---

*Fin du document. Toutes les références de chemin sont valides à la date du snapshot du repo. Mises à jour majeures du modèle (nouveau type d'OutdatedPackage / UpdateOutcome, refonte du moteur de scan) devront être reflétées ici.*
