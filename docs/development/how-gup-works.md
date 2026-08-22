# How `gup` works — End-to-end technical walkthrough

> Source document for the explanatory site. Aimed at intermediate / advanced developers. Covers **the entirety** of `gup`'s operation: motivation, model, architecture, command lifecycle, internal contracts, resilience patterns, security, build.
>
> Repo: `LINDECKER-Charles/gup` · Stack: strict TypeScript (Node ≥ 24), ESM, `execa`, `commander`, `@inquirer/prompts`, `chalk`, `cli-table3`, `ora`, `p-limit`. No browser runtime, no UI framework: this is a pure CLI.

---

## 0. Elevator pitch

`gup` ("Global Updater") is a **unified CLI** that scans, in parallel, ~150 different installation sources (OS package managers, runtimes, dev tools, IDE extensions, cloud / IaC / K8s registries…), lists everything that is outdated, then runs each source's native update commands.

It is deliberately an **orchestrator of existing tools**. `gup` does not invent an update protocol, ships no version cache, and downloads nothing itself: it **shells out** to `winget upgrade`, `npm outdated -g --json`, `helm repo update`, `pip list --outdated --format json`, etc., and homogenizes their heterogeneous outputs behind a single user interface.

Three ways to use it:

1. **Interactive menu** (bare `gup` command) — automatic scan, then a Review / Update selected / Update all / Update target / Providers / Options menu.
2. **Non-interactive** (`gup list`, `gup update --all -y`) — suitable for automation and CI.
3. **Targeted** (`gup update winget:Microsoft.PowerShell npm-g:typescript`) — bypasses the scan entirely.

---

## 1. Why `gup` exists — the business problem

On a modern dev workstation, a binary may come from **dozens of competing sources**, each with:

- Its own update-listing command (`winget upgrade`, `npm outdated -g --json`, `pipx list`, `scoop status`, `helm repo update && helm search repo`, `gem outdated`, `dotnet tool list -g`, `cargo install --list`, `cs update --installed`, `kubectl version`, etc.).
- Its own output format (fixed-width text table, JSON, JSONL, YAML, localized human output…).
- Its own edge cases: `winget` silently ignores "pinned" and "unknown version" packages; `ncu -g` only sees npm; cloud CLIs (`az`, `gcloud`, `aws`) each have their own `self-update` subcommand to invoke by hand; HashiCorp tools (`terraform`, `vault`, `consul`, …) have no built-in updater at all and must be compared to their releases feed.

Observation: **no native tool covers the entire surface**. The practical consequence for a developer is having 10–15 commands to chain manually, several times a month, without knowing which one forgot what.

`gup` reduces this to **one command** + a parallel scan loop + a coherent UI.

### Boundaries

What `gup` is *not*, and the sources it deliberately leaves alone — Windows
Update, macOS system updates, Apple's SIP-frozen Ruby, project lockfiles,
Toolbox-managed IDEs — each with the reasoning behind the exclusion:
[`scope.md`](../guide/scope.md).

---

## 2. Vocabulary / key concepts

One vocabulary to internalize:

| Term | Definition |
|---|---|
| **Provider** | Isolated module that knows how to handle **one** installation source. One file = one provider. Implements the `Provider` interface (`src/core/types.ts`). Examples: `WingetProvider`, `NpmGlobalProvider`, `HelmProvider`. |
| **Provider id** | Stable kebab-case identifier, unique across the registry. Used at the CLI: `gup update <provider-id>:<packageId>` (e.g. `winget:Microsoft.PowerShell`). |
| **OutdatedPackage** | One scan-result entry: `{ id, name?, current, latest, note?, manual? }`. It is the **currency** between the Provider layer and the UI. |
| **UpdateOutcome** | Result of an update: `{ id, success, skipped?, message?, retryable? }`. |
| **ProviderScanResult** | Per-provider aggregate after a scan: `{ providerId, available, packages[], error? }`. |
| **slow** | Declarative flag on a Provider (`readonly slow = true`) that disables its scan in `--fast` mode. To be used when the scan does HTTP per package or a heavy filesystem walk. |
| **manual** | Flag on an `OutdatedPackage` meaning "the provider knows right now that the update will require human intervention". Filtered out of `scanAll` → never shown to the user, never included in Update all. |
| **skipped** | Flag in `UpdateOutcome`: the update was attempted then gracefully abandoned (human action required — e.g. missing admin terminal, GUI-only). Shown as yellow `SKIP`, distinct from red `FAIL`. |
| **retryable** | Flag in `UpdateOutcome`: the failure might pass with a more aggressive strategy (`--force`, `--uninstall-previous`, two-step reinstall). Triggers the post-batch retry prompt. |

These seven primitives are enough to model the entire behavior of `gup`.

---

## 3. Bird's-eye architecture

```
                           ┌─────────────────────┐
        user typing  ─────▶│   src/cli.ts        │  commander, dispatch sub-cmds
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
                             │ fan-out (concurrency=4 by default)
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

### File layout

```
src/
├── cli.ts                    # commander entry
├── commands/                 # 1 file = 1 user-facing subcommand
│   ├── list.ts               # gup list
│   ├── update.ts             # gup update
│   ├── doctor.ts             # gup doctor
│   └── menu.ts               # gup (no subcmd) — interactive REPL
├── core/
│   ├── types.ts              # Provider, OutdatedPackage, UpdateOutcome, UpdateOptions, ProviderScanResult
│   ├── runner.ts             # run, runInherit, commandExists, whichFirst, isElevated
│   ├── registry.ts           # ALL_PROVIDERS, detectAvailableProviders, scanAll, getProvider
│   ├── gh-releases.ts        # fetchGitHubReleaseLatest, fetchGitHubReleaseTagMatching, normalizeVersion
│   ├── hashicorp-releases.ts # helper for Terraform / Vault / Consul / Nomad / Packer / Boundary
│   ├── wsl.ts                # bridge `wsl.exe -d <distro> -- <cmd>`
│   ├── install-source.ts     # heuristic to guess which PM owns a binary (delegateUpdate)
│   ├── corepack-ownership.ts # detection of "is pnpm/yarn a corepack shim?"
│   └── nvim-paths.ts         # neovim config locator (lazy / packer / mason)
├── providers/                # 1 file = 1 provider
│   ├── _template.ts          # skeleton to copy when adding a provider
│   ├── self.ts               # meta-provider: update of the PMs themselves
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
│   ├── containers/           # nerdctl, oras, dive, docker-desktop, podman-desktop, rancher-desktop
│   ├── security/             # trivy, grype, syft, cosign, rekor, gitsign, nuclei, nuclei-templates, pdtm, semgrep
│   ├── dev-cli/              # lazygit, lazydocker, jj, delta, glab, tea, gh-extensions
│   ├── ide/                  # vscode-ext, cursor-ext, windsurf-ext, vscodium-ext, jetbrains (+ manual-only refs: jetbrains-plugins, zed-ext, sublime-pc, obsidian-plugins, unity-hub, notepad-pp, eclipse-marketplace)
│   ├── editor-plugins/       # nvim-lazy, nvim-packer, nvim-mason, vim-plug
│   ├── embedded-mobile/      # arduino-cli, platformio, android-sdk, expo, fastlane
│   └── shell/                # oh-my-posh, starship, nerd-fonts, pwsh-modules
└── ui/
    ├── table.ts              # cli-table3 wrappers (renderScanTable, renderProvidersStatus)
    ├── scan-progress.ts      # ora spinner + [done/total] counters + in-flight names
    ├── select.ts             # @inquirer/prompts checkbox grouped by provider
    └── retry-failed.ts       # post-batch retry-strategy prompt
```

### Guiding principle #1: **provider isolation**

> One file = one provider. **No cross-imports** between providers. No shared state.

The goal is that a provider that breaks (parser broken on a new upstream version, HTTP timeout, uncaught exception) **only affects its own cell of the table**. Concretely, `scanAll` wraps every `listOutdated()` call in a `try/catch` that turns it into `ProviderScanResult.error: string`. The other providers keep running in parallel.

### Guiding principle #2: **shell out only through `runner.ts`**

> No direct `child_process`. Everything goes through `run()` / `runInherit()`.

These wrappers centralize: forced UTF-8 encoding (otherwise `winget`, `choco` render mojibake under cp65001), `windowsHide: true`, `reject: false` (never throw on non-zero exit), explicit argv-vector (never `shell: true`). The two providers that need `shell: true` (Scoop, because of its PowerShell shim) are **pinned by allowlist** in `tests/security/shell-usage.test.ts`.

### Guiding principle #3: **fail-soft, never-throw**

> `listOutdated` and `update` **never throw**. They return `[]` or `{ success: false, message }`.

An uncaught exception inside a provider would collapse the entire parallel scan. The contract is: if you can't, return empty / failed with a clear message, but **don't break the chain**.

---

## 4. Full command lifecycle

### 4.1 `gup` (bare command — interactive menu)

```
1. commander parses argv → no subcommand detected
   └─> calls program.action() → menuCommand()  (src/commands/menu.ts)

2. menuCommand() initializes MenuState:
     { scans: [], fast: false, filter: [], detectedCount: 0 }

3. printHeader()  →  ASCII title + version
4. initialScan(state)
     └─> ui/scan-progress.scanWithProgress({ fast, only? })
           ├─ ora spinner "detecting providers…"
           ├─ detectAvailableProviders(): Promise.all(ALL_PROVIDERS.map(p => p.isAvailable()))
           ├─ filter (only / fast)  →  planned[]
           ├─ scanAll({ detected, onProviderStart, onProviderEnd })
           │     └─> pLimit(4) wraps each provider.listOutdated()
           │           ├─ live render(): in-flight set, [done/total], top-3 + "+N"
           │           ├─ catch error → ProviderScanResult.error
           │           └─ filter `pkg.manual === true`
           └─ spinner.stopAndPersist(`scan completed in Xs — N providers, M updates`)

5. Infinite menu loop:
     printStatus(state)  →  "K provider(s) detected · M update(s)"
     select<MenuAction>  →  Scan / Review / Update selected / Update all
                              / Update target / Providers / Options / Quit

   Each action:
     - Scan      → initialScan(state)  (rescan)
     - Review    → renderScanTable(state.scans)
     - select    → ui/select.promptPackageSelection(state.scans)
                   ├─ checkbox grouped by provider
                   ├─ confirm "Apply N updates?"
                   ├─ group by providerId → provider.updateAll(pkgs) (or .update if 1)
                   ├─ maybeRetryFailures(entries) (cf. §10)
                   └─ summarize(outcomes)
                   then rescan
     - all       → confirm → loop over scans → provider.updateAll → retry → summarize → rescan
     - target    → input "provider:packageId, space/comma" → loop .update
     - doctor    → renderProvidersStatus(detected, missing)
     - options   → toggle fast / filter by providers (checkbox)
     - quit      → return 0
```

### 4.2 `gup list`

```
listCommand({ only?, fast?, json? })
  ├─ if json → raw scanAll(), JSON.stringify(results)
  └─ else    → scanWithProgress() + renderScanTable()
```

No prompt, no writes, output on stdout. Always exit 0 (list does not *do* anything except in case of catastrophic error).

### 4.3 `gup update [targets...]`

Three paths:

```
updateCommand({ all, yes, only, fast, targets })

(a) targets provided:
    → runTargets(targets)
        └─ split "provider:packageId" → getProvider → provider.update(packageId)
        → maybeRetryFailures → summarize
    SHORTCUT: full scan skipped.

(b) all + yes:
    → scanWithProgress
    → selection = ALL packages
    → group by provider → provider.updateAll
    → retry → summarize → exit code (0 if nothing failed, 1 otherwise)

(c) neither all nor targets:
    → scanWithProgress
    → promptPackageSelection (interactive checkbox)
    → group by provider → provider.updateAll
    → retry → summarize
```

### 4.4 `gup doctor`

```
doctorCommand()
  ├─ Promise.all(ALL_PROVIDERS.map(p => ({ p, ok: await p.isAvailable() })))
  ├─ detected = ok'd providers
  ├─ missing  = !ok'd, with installHint
  └─ renderProvidersStatus(detected, missing)
```

No scan, no update: only answers the question "what is detectable on this machine, and how do I install what is missing?".

---

## 5. The **Provider** contract — anatomy in detail

The heart of `gup`. The entire value of the project lies in the quality and isolation of the ~150 implementations of this interface.

```ts
export interface Provider {
  readonly id: string;            // kebab-case, unique, stable (CLI key)
  readonly displayName: string;   // shown in table / menu — short, no marketing
  readonly installHint?: string;  // shown by `gup doctor` when not detected
  readonly slow?: boolean;        // true ↔ HTTP-per-package, heavy FS walk, etc.

  isAvailable(): Promise<boolean>;
  listOutdated(): Promise<OutdatedPackage[]>;
  update(packageId: string, options?: UpdateOptions): Promise<UpdateOutcome>;
  updateAll(packages: OutdatedPackage[], options?: UpdateOptions): Promise<UpdateOutcome[]>;
}
```

### 5.1 `isAvailable()` — detection

Must return **fast**. Standard strategy: `commandExists("<binary>")`, which under the hood runs `where <bin>` (Windows) / `which <bin>` (POSIX). Cost ~a few ms.

Edge cases:
- Providers that depend on a **config folder** rather than a binary (e.g. `nvim-lazy` detects `~/.local/share/nvim/lazy` or the Windows equivalent) use `access()` from `node:fs/promises`.
- WSL providers: available if `wsl.exe` responds **and** a distro running a target PM is listed. See `src/core/wsl.ts`.

### 5.2 `listOutdated()` — the scan

The most complex and most variable method. The contract:

1. **Never throw.** On parsing error, HTTP timeout, broken PM: return `[]`.
2. **Only emit truly outdated packages.** `current === latest` must be filtered out.
3. Build each `OutdatedPackage` with:
   - `id`: identifier usable by `update(id)` (provider-local; no need to be globally unique).
   - `name?`: human-readable name when different from id.
   - `current` / `latest`: strings as emitted by the PM, **un-normalized** (the UI displays them as-is — semantic comparison happens inside the provider via `normalizeVersion()`).
   - `note?`: free-form extra info (`"pinned"`, `"unknown version"`, `"source: msstore"`…).
   - `manual?: true`: signals that the update will require a human action. Filtered by `scanAll` → invisible to the user, **but still part of the "show or not" decision**. Usage patterns: JetBrains Toolbox, plugins behind a GUI, App Installer packages (winget itself).

#### Pattern A: the PM exposes JSON

The happy path. Example `NpmGlobalProvider`:

```ts
const { stdout } = await run("npm", ["outdated", "-g", "--json", "--long"]);
const parsed = JSON.parse(stdout) as Record<string, NpmOutdatedEntry>;
return Object.entries(parsed)
  .filter(([, info]) => info.current && info.latest && info.current !== info.latest)
  .map(([name, info]) => ({ id: name, name, current: info.current!, latest: info.latest! }));
```

No regex, no positional parsing.

#### Pattern B: the PM only emits a text table

`WingetProvider`, `ScoopProvider`. Technique: locate the **header line** ("Name Installed Version Latest Version"), compute column offsets from each header's position, then slice each line on those offsets. Resilient to localized labels (FR/EN).

```ts
const headerIdx = lines.findIndex((l) => /^\s*Name\s+Installed Version\s+Latest Version/i.test(l));
// then for each line past the separator:
const parts = line.trim().split(/\s{2,}/);  // ≥ 2 spaces = new column
```

#### Pattern C: the PM has no "list outdated", but exposes `--version`

Typical for HashiCorp tools, cloud CLIs, most dev tools (`lazygit`, `jj`, `delta`…). The provider:

1. Reads the installed version via `<bin> --version`.
2. Fetches the upstream version through an API (GitHub Releases, HashiCorp Checkpoint, npm registry, PyPI…).
3. Compares with `normalizeVersion()` (trim leading `v`, lowercase).
4. Produces **at most one** `OutdatedPackage` entry (a single "package" to update: the tool itself).
5. `update()` delegates to a host PM via `delegateUpdate()` (`core/install-source.ts`).

Condensed example (`SelfProvider` for `gh`):

```ts
{
  id: "gh", displayName: "GitHub CLI", binary: "gh",
  current: async () => parseFirstSemver(await runStdout("gh", ["--version"])),
  latest: async () => fetchGitHubReleaseLatest("cli/cli"),
  update: async () => delegateUpdate({
    id: "gh", binary: "gh",
    packageIds: { winget: "GitHub.cli", scoop: "gh", choco: "gh" },
    manualMessage: "Download https://github.com/cli/cli/releases and replace gh.exe",
  }),
}
```

All these providers are **flagged `slow = true`** (one HTTP call per scan).

#### Pattern D: `helm repo update` + `helm search repo --versions` (Kubernetes/Helm)

Helm is sui generis: no built-in "outdated". The technique is to `helm repo update` (refresh local), then for each installed release compare the local version to the `version` field of `helm search repo <chart> --versions -o json`. Expensive → flagged `slow`.

#### Pattern E: WSL bridge

Providers `wsl-apt`, `wsl-dnf`, `wsl-pacman`, etc. work by wrapping `wsl.exe -d <distro> -- <linux-command>`. The helper `src/core/wsl.ts` handles:
- Detection of available distros (`wsl.exe -l -q`).
- Selection: if several distros run the same PM, list per distro and produce a compound id (`apt:<distro>:<pkg>`).

### 5.3 `update(packageId, options?)` — one package

Receives a `packageId` (from `OutdatedPackage.id` or typed by the user) and **always** returns an `UpdateOutcome`:

```ts
interface UpdateOutcome {
  id: string;
  success: boolean;
  skipped?: boolean;    // ran out gracefully, human action required
  message?: string;     // reason for failure / skip
  retryable?: boolean;  // could pass with a more aggressive strategy
}
```

`UpdateOptions`:

```ts
interface UpdateOptions {
  force?: boolean;              // bypass hash check (e.g. winget --force)
  uninstallPrevious?: boolean;  // e.g. winget --uninstall-previous (destructive)
  reinstall?: boolean;          // last resort: uninstall + install in 2 commands
}
```

These flags are NEVER set by `gup` itself on the first pass. They are activated only by the **user explicitly**, through the post-batch retry menu (`ui/retry-failed.ts`). See §10.

Typical implementation:

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

Notes:
- `runInherit` **streams the subprocess's stdout/stderr directly to the user's terminal**. Intentional: during an update we want to see progress bars, interactive prompts (winget can request EULA acceptance), warnings.
- Don't confuse with `run()`, which captures stdout/stderr in memory (used for parsing in `listOutdated`).

### 5.4 `updateAll(packages, options?)` — bulk

When the PM supports a native grouped upgrade, the provider uses it and **maps the single result** to as many `UpdateOutcome`s as packages:

```ts
// npm-global: a single `npm install -g pkg1@latest pkg2@latest …`
async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
  const args = ["install", "-g", ...packages.map((p) => `${p.id}@latest`)];
  const res = await runInherit("npm", args);
  return packages.map((p) => ({ id: p.id, success: !res.failed }));
}
```

When the PM does not support bulk (case of `SelfProvider`, some GitHub-Release-driven providers), `updateAll` simply loops over `update`.

### 5.5 `manual: true` vs `skipped: true`

Two orthogonal concepts to clearly separate:

- **`manual: true`** is set on an `OutdatedPackage` by `listOutdated`. Means: "this package is outdated, but I already know no automatic command will work (GUI-only, Microsoft Store, etc.)". `scanAll` **filters them out at scan time** (`packages.filter(pkg => !pkg.manual)`) — the user never sees them. Providers that produce **only** `manual` items are removed from the registry so they don't bloat scan time (cf. the comments in `src/core/registry.ts` around `jetbrains-plugins`, `zed-ext`, etc.).
- **`skipped: true`** is set on an `UpdateOutcome` by `update()`. Means: "I tried, I detected mid-way that a human condition was missing (for example: no admin elevation), I stopped without breaking anything". The user sees it as yellow `SKIP` distinct from red `FAIL`.

---

## 6. The scan engine — `core/registry.ts`

### 6.1 `ALL_PROVIDERS`

A simple static list of instances. The order in the list **drives the display order** in `gup doctor` and in the scan table. Organized by category for readability.

```ts
export const ALL_PROVIDERS: Provider[] = [
  new WingetProvider(), new ScoopProvider(), new ChocoProvider(),
  new WslProvider(), new WslAptProvider(), /* ... */
  new NpmGlobalProvider(), /* ... */
  // ~150 entries total
  new SelfProvider(), // always last
];
```

### 6.2 `detectAvailableProviders()`

```ts
const checks = await Promise.all(
  ALL_PROVIDERS.map(async (p) => ({ p, ok: await p.isAvailable() })),
);
return checks.filter((c) => c.ok).map((c) => c.p);
```

Full probe, in parallel, no pLimit (the `commandExists` calls are `where`/`which`, ms-cheap, the cost is anyway dominated by the slowest binary to respond — typically `wsl.exe -l -q`).

### 6.3 `getProvidersToScan(options)`

Filters `ALL_PROVIDERS`:

```ts
return available.filter((p) => {
  if (options.only?.length && !options.only.includes(p.id)) return false;  // --provider winget npm-g
  if (options.fast && p.slow) return false;                                 // --fast
  return true;
});
```

The `options.detected` lets a UI that already ran `detectAvailableProviders()` (the "detecting providers…" spinner) avoid doing it again.

### 6.4 `scanAll(options)` — the orchestrator

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

Three invariants set here:
1. **Concurrency 4 by default.** Goal: don't saturate the machine with subprocesses and keep the spinner output readable. Configurable via `concurrency`.
2. **The `try/catch` is in `scanAll`, not in the provider.** The provider is free to throw, scanAll absorbs. It is the last line of defense.
3. **`pkg.manual` is filtered here, once.** No downstream code needs to know `manual` exists (except the rare providers that produce them internally).

---

## 7. The runner — `core/runner.ts`

All interaction with the system happens through 5 functions in this file.

```ts
// 1. Capture stdout/stderr in memory — used by listOutdated() for parsing
async function run(command, args = [], options = {}): Promise<RunResult>

// 2. Stream stdout/stderr to the user's terminal — used by update() so they see the install run
async function runInherit(command, args = [], options = {}): Promise<RunResult>

// 3. `where <bin>` / `which <bin>` — used everywhere in isAvailable()
async function commandExists(command): Promise<boolean>

// 4. First PATH resolution of a binary — used when location matters (e.g. corepack-ownership)
async function whichFirst(command): Promise<string | null>

// 5. Windows elevation probe (`net session`) — used by admin-required providers (choco)
async function isElevated(): Promise<boolean>
```

### Key decisions

- **`reject: false`**: execa throws on non-zero exit by default. Here we inspect `failed` by hand. Avoids wrapping every call in try/catch.
- **`encoding: "utf8"`** on `run()`: without this, Windows on cp65001 returns mojibake (`winget`, `choco` especially). Breaks table parsing.
- **`windowsHide: true`**: otherwise every subprocess briefly opens a flashing cmd window. Cosmetic but essential for UX.
- **No `shell: true` by default.** The argv vector prevents injection. The two exceptions (Scoop: its PowerShell shim can't be invoked otherwise) are **allowlisted by a security test** (`tests/security/shell-usage.test.ts`): if a new provider wants `shell: true`, the test breaks.

### `RunResult`

```ts
interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  failed: boolean;  // true if exitCode !== 0 OR if execa flagged failed (timeout, signal, etc.)
}
```

Deliberately flat. No "value" / "ok" sugar. Reads straight.

---

## 8. Cross-cutting helpers (`core/`)

### 8.1 `gh-releases.ts`

The most frequent pattern in `gup`: "this package comes from GitHub, fetch the latest release tag and compare it to `<bin> --version`".

```ts
fetchGitHubReleaseLatest(ownerRepo, { stripVPrefix = true, timeoutMs = 5000 })
fetchGitHubReleaseTagMatching(ownerRepo, predicate, opts) // for kustomize, k3d: prefixed tags
normalizeVersion(v)  // strip "v", lowercase, trim
```

All these functions return `null` on network / HTTP error: **no throw**. The provider using them treats `null` as "skip this scan entry".

5 s default timeout, bounded by `AbortSignal.timeout(5_000)`. Crucial: without this, a single GitHub API timeout could block a whole parallel scan (with concurrency=4, the queue waits for the slot).

### 8.2 `hashicorp-releases.ts`

Equivalent for Terraform / Vault / Consul / Nomad / Packer / Boundary. Uses the `https://api.releases.hashicorp.com/v1/releases/<product>/latest` endpoint which has no GitHub rate-limit.

### 8.3 `wsl.ts`

Detects WSL distros (`wsl -l -q`), invokes Linux commands through `wsl -d <distro> -- bash -c "<cmd>"`. Used by all 7 `wsl-*` providers.

### 8.4 `install-source.ts`

Inverse heuristic: given a binary on PATH, guess which PM installed it (based on the resolved path — `%LOCALAPPDATA%\Microsoft\WinGet\Packages\…` → winget, `~\scoop\…` → scoop, `/opt/homebrew/Cellar/…` → brew, etc.). Exposed via `delegateUpdate()`, used by providers that don't self-update and must reroute to their host PM (e.g. `gh`).

Sources: `scoop`, `choco`, `winget`, `brew`, `apt`, `dnf`, `manual`.

Two POSIX-only refinements sit on top of the plain path match:

- **Symlink resolution.** Homebrew only exposes a symlink on PATH (`/opt/homebrew/bin/kubectl` → `../Cellar/kubernetes-cli/1.36.3/bin/kubectl`). `which` reports the link, so without `realpath` every brew install would classify as `manual` — and since providers turn `manual` into `manual: true`, which `scanAll` filters out, every brew-installed tool was **silently invisible** on macOS. This is the single change that makes the macOS scan honest.
- **Package-database probe.** Distro packages live in shared prefixes (`/usr/bin`) that carry no ownership signal in the path; `dpkg -S` / `rpm -qf` are the only reliable answer. Only consulted for paths under a system prefix, and only on Linux.

Neither runs on Windows. The win32 branch was restructured — the `where` probe moved out of `detectInstallSource` into the shared `resolveBinaryPath()` — but it is semantically identical, and `tests/core/install-source-macos.test.ts` pins the properties that matter: `realpath` is never called, no extra probe is spawned, and the scoop/choco/winget verdicts are unchanged.

The Homebrew classifier is deliberately conservative: `/opt/homebrew` and `.linuxbrew` are brew-exclusive prefixes, but `/usr/local` is shared with hand-installs, so it only counts when combined with a `Cellar`/`Caskroom` segment. A directory merely *named* `cellar` never routes an upgrade to brew — pinned by `tests/security/install-source.test.ts`.

### 8.5 `corepack-ownership.ts`

Tricky pnpm / yarn case. Modern pnpm/yarn can be:
- Installed directly (`pnpm self-update`, `npm i -g yarn`),
- Or shimmed by corepack (`corepack prepare pnpm@latest --activate`).

The binary on PATH can be either. Detection looks at whether the binary's path is inside the corepack directory. `SelfProvider` uses this to avoid offering a `pnpm self-update` that would not work if pnpm is a corepack shim — that case is handled by `CorepackProvider`.

### 8.6 `nvim-paths.ts`

Locates Neovim directories per OS (`XDG_DATA_HOME`, `%LOCALAPPDATA%\nvim-data`, etc.) for the `nvim-lazy`, `nvim-packer`, `nvim-mason` providers.

---

## 9. Commands — `commands/`

### 9.1 `cli.ts` — the entry

Pure commander orchestration. 5 entry points (default + 4 subcommands). Each action `await`s a `*Command()` that returns an exit code, then `process.exit(code)`. Global catch:
- `ExitPromptError` (Ctrl+C inside an @inquirer prompt) → silent, exit 130 (POSIX SIGINT convention).
- Other exception → `chalk.red("Error:")` + message + exit 1.

### 9.2 `list.ts`

Thin. Either pipeable JSON (`--json` → raw `scanAll` → `JSON.stringify`) or colorized table (`scanWithProgress` + `renderScanTable`). Always exit 0.

### 9.3 `update.ts`

Three branches depending on options (cf. §4.3). Important: the code groups `selection` by `providerId` before calling `provider.updateAll(pkgs)` to benefit from native bulk when available.

### 9.4 `doctor.ts`

Probe only, no scan. Outputs `renderProvidersStatus(detected, missing)`. No `--json` (intentional — it's an interactive diagnostic command, not a scriptable primitive; use `gup list --json` for that).

### 9.5 `menu.ts`

The "default" mode. REPL in `for(;;)`. Maintains a `MenuState` shared between iterations:
- `scans`: latest scan results (reused until a rescan).
- `fast`: fast-mode flag.
- `filter`: list of providers to scan (empty = all).
- `detectedCount`: number of detected providers (shown in the status bar).

The menu invalidates `scans` after every update batch (auto-rescan) → the user immediately sees the updated packages disappear from the list.

---

## 10. Retry strategies — `ui/retry-failed.ts`

Specific to `winget` but designed generically. The problem: `winget upgrade` can fail for several reasons reversible with a more aggressive command:

- Installer hash mismatch → `--force` ignores the check.
- Installer technology change (MSI → MSIX) or current version "Unknown" → `--uninstall-previous` uninstalls first.
- Case where even `--uninstall-previous` does not trigger → execute `winget uninstall` then `winget install --force` as two separate commands.

### Mechanism

1. Each provider that can be in this case returns `{ success: false, retryable: true }` on first failure.
2. At end of batch, `maybeRetryFailures(entries)` checks if at least one entry is `retryable`.
3. If so, presents the user (and ONLY them — never under `--yes`) a `select` with 3 progressively more aggressive strategies:
   - `--force` (safe — only bypasses the SHA check).
   - `--force --uninstall-previous` (destructive — can lose app config outside `%APPDATA%`).
   - `uninstall + install` in 2 steps (last resort — same destructiveness).
4. The user picks "None" to leave the failure, or a strategy to retry **all** retryables.
5. The function calls itself with the already-tried strategy **excluded** from the next choices. Guarantee against infinite loops.

### Why this structure

- **Explicit opt-in**: `--force` disables integrity check, so we never trigger it without human confirmation.
- **CI-safe mode**: `-y / --yes` short-circuits any retry. Acceptable: if a winget fails in CI, we want to see it.
- **Single progression**: the list of already-tried strategies is carried in the recursion (`excludeStrategies`). No global state, no mutable queue.

---

## 11. The UI layer — `ui/`

### 11.1 `table.ts`

Wraps `cli-table3`. Two helpers:
- `renderScanTable(results)`: Provider · Package · Current · Latest · Note. Lexicographic sort by providerId. Scan errors shown inline in red. Totalizes updates at the bottom.
- `renderProvidersStatus(detected, missing)`: double bullet list, green (●) / gray (○). Missing entries show their `installHint`.

### 11.2 `scan-progress.ts`

The most user-facing element. Uses `ora` (Unicode spinner) + local state to render:

```
⠋ scan [12/47] — npm (global) · pip · Helm  +5
```

Mechanics: `inFlight = new Set<string>()`. `onProviderStart` adds the `displayName`, `onProviderEnd` removes it. On every event, `render()` rebuilds the string with the first 3 + "+N" on overflow. On error, persists the message briefly before the next render.

At the end, a `stopAndPersist` shows the summary: duration, number of providers, number of updates.

### 11.3 `select.ts`

Wraps `@inquirer/prompts.checkbox` but with a **grouped by provider** layout. Separates each group with a `Separator`, indents packages, displays the note in gray on the right.

### 11.4 `retry-failed.ts`

Covered in §10.

---

## 12. `--fast` mode

Many providers do HTTP per package (helm-search, vscode-ext, pwsh-modules, self) or heavy filesystem walks. On a well-populated machine, a full scan can take 30–60 seconds.

`--fast` (or `Options → Fast mode ON` in the menu) **excludes every `slow = true` provider** from the scan list. Brings the scan down to typically <5 seconds.

It is **a declarative flag on the provider**, not a centralized allowlist. Adding a slow provider only requires writing `readonly slow = true` on the class — no modification of `registry.ts`.

Typical list of `slow`s: `pwsh-modules` (PowerShell Gallery HTTP per module), `vscode-ext` (GitHub Marketplace), `helm-repo` (`helm repo update`), `pip` (PyPI HTTP per package), `self` (npm/PyPI/GitHub per PM), every HashiCorp IaC provider (release feed), Helm chart providers, etc.

---

## 13. Providers catalog (snapshot)

Canonical source: [`docs/guide/providers-catalog.md`](../guide/providers-catalog.md). Current distribution (~150 entries):

| Category | # | Examples |
|---|---:|---|
| OS / Windows | 6 | winget, scoop, choco, msys2, cygwin, npackd |
| OS / macOS | 6 | brew, brew-cask, mas, macports, sparkle, fink |
| OS / POSIX | 3 | nix, pkgx, pkgin |
| WSL | 7 | wsl, wsl-apt, wsl-dnf, wsl-pacman, wsl-brew, wsl-flatpak, wsl-nix |
| Node.js / JS | 10 | npm-g, pnpm-g, yarn-g, bun-g, deno, corepack, fnm, volta, nvm-windows, nvm |
| Python | 9 | pip, pipx, uv-tools, poetry, pdm, rye, pyenv-win, pyenv, conda |
| .NET / PHP | 7 | dotnet-tools, dotnet-sdk, nuget, composer-self, composer-g, symfony-cli, phive |
| JVM | 2 | jbang, coursier-cs |
| Rust | 2 | rustup, cargo |
| Other languages | 14 | gem, opam, hex, mix-archive, luarocks, cabal, stack, nimble, julia-pkg, r-packages, flutter, pub-global, vcpkg, mint |
| Polyglot toolchain | 6 | mise, asdf, proto, sdkman, goenv, swiftly |
| Cloud CLIs | 12 | az, gcloud, aws, oci, scw, hcloud, linode, doctl, supabase, heroku, railway, flyctl |
| IaC | 10 | terraform, opentofu, terragrunt, vault, consul, nomad, packer, boundary, tflint, pulumi |
| Kubernetes / Helm | 13 | helm, helm-repo, helm-plugins, kubectl, krew, kustomize, flux, argocd, k3d, kind, minikube, skaffold, tilt |
| Containers | 6 | nerdctl, oras, dive, docker-desktop, podman-desktop, rancher-desktop |
| Security scanning | 10 | trivy, grype, syft, cosign, rekor, gitsign, nuclei, nuclei-templates, pdtm, semgrep |
| Dev CLIs | 8 | lazygit, lazydocker, jj, delta, glab, tea, gh-extensions, git-for-windows |
| IDEs / Extensions | 6 | vscode-ext, cursor-ext, windsurf-ext, vscodium-ext, jetbrains, visual-studio |
| Editor plugins | 4 | nvim-lazy, nvim-packer, nvim-mason, vim-plug |
| Embedded / Mobile | 6 | arduino-cli, platformio, android-sdk, xcodes, expo, fastlane |
| Shell / cosmetic | 5 | oh-my-posh, starship, nerd-fonts, pwsh-modules, psresource |
| Meta | 1 | self (auto-update of the PMs themselves) |

The `providers-catalog.md` doc details for each one: ID, upstream source, status (✅ integrated, 🚧 code present / not wired because manual-only, ⬜ candidate, ➡️ absorbed, ❌ out of scope).

---

## 14. Notable edge cases

### 14.1 `WingetProvider` — localized table parsing

Winget has no JSON mode for `upgrade`. The provider:
1. Reads `winget upgrade --include-unknown --accept-source-agreements`.
2. Looks up the header line via a locale-tolerant regex.
3. Computes column offsets from header positions.
4. Slices each line on those offsets.
5. Cross-references the `winget pin list` to annotate `pinned`.
6. Marks `note: "unknown version"` when the current version is `<` (winget sentinel for "unknown version").

The update accepts 3 progressive levels (force, force+uninstall-previous, two-step reinstall), all behind `UpdateOptions`. Each failure raises the `retryable: true` flag so `maybeRetryFailures` can offer the next level.

### 14.2 `ScoopProvider` — the `shell: true` exception

Scoop is actually a PowerShell script (`scoop.ps1` exposed via the `scoop.cmd` shim). For execa to invoke it correctly on Windows, `shell: true` is required. Injection risk is neutralized by:
1. A strict validation regex on the packageId: `^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)?$` (Scoop charset).
2. A security test (`tests/security/shell-usage.test.ts`) that pins the exhaustive list of `shell: true` calls in the codebase. Any new usage breaks CI.

### 14.3 `SelfProvider` — meta-update of PMs

Surfaces "the PM itself is outdated". Covers winget, scoop, choco, npm, pnpm, yarn, pip, pipx, gh. For each one:
1. `current()`: parse `<bin> --version` with a tolerant semver regex.
2. `latest()`: upstream fetch (npm registry, PyPI, GitHub Releases depending on the PM).
3. `update()`: canonical documented command (`scoop update`, `npm install -g npm@latest`, `corepack prepare yarn@stable --activate`, `pipx upgrade pipx`, …).

Three ownership quirks handled:
- **pnpm / yarn corepack-owned**: if the binary is a corepack shim, `SelfProvider` skips that target (it's `CorepackProvider`'s job via `corepack prepare`).
- **pip on Windows multi-Python**: resolution of the target interpreter is done from the physical path of `pip.exe` (not via `py -m pip`), to guarantee the install resolved by PATH is the one being updated.
- **gh**: no `self update`. Delegation to `winget` / `scoop` / `choco` via `install-source.ts`.

### 14.4 Manual-only providers removed from the registry

The providers `jetbrains-plugins`, `zed-ext`, `sublime-pc`, `obsidian-plugins`, `unity-hub`, `notepad-pp`, `eclipse-marketplace` exist as **code** in `src/providers/ide/` but are **not** in `ALL_PROVIDERS`. Reason: all their items come out `manual: true`, so `scanAll` would filter 100% of them. Leaving them in the registry would add scan time with no UI benefit. The code is kept as a reference for a future where an automatable update path would appear.

---

## 15. Security

Significant attack surface (shell-out to ~150 third-party tools). See `SECURITY.md`.

### Threat model

1. **Command injection via hostile package id** (compromised upstream manifest, poisoned registry response).
   - Mitigation: argv-vector everywhere, `shell: true` allowlisted + regex validation on the packageIds that use it.
2. **MITM on upstream version probes**.
   - Mitigation: every `fetch()` must target `https://`. Pinned by `tests/security/http-targets.test.ts`.
3. **Provider mis-routing**.
   - `install-source.inferSourceFromPath` decides which PM owns a binary; misclassification = upgrade against the wrong source.
   - Pinned by `tests/security/install-source.test.ts`.

### Tooling

| Layer | Tool | Config |
|---|---|---|
| Static SAST | CodeQL `security-extended` + `security-and-quality` | `.github/workflows/security.yml` |
| Custom SAST | Semgrep + `p/typescript` + `p/nodejs` | `.semgrep.yml` |
| Secrets | gitleaks | `.gitleaks.toml` |
| Dep vulns | `audit-ci` (CI) + Dependabot weekly grouped | `audit-ci.json`, `.github/dependabot.yml` |
| Lint | `eslint-plugin-security` | `.eslintrc.security.cjs` |
| Custom pins | Vitest security suite | `tests/security/*.test.ts` |

`npm run security` chains `audit:deps:ci` + `lint:security` + `test:security`.

---

## 16. Tests

Stack: Vitest + v8 coverage. Cross-platform CI: Windows + macOS + Ubuntu × Node 22 + Node 24.

```bash
npm run typecheck             # tsc strict + noUncheckedIndexedAccess + exactOptionalPropertyTypes
npm run test                  # watch
npm run test:run              # one-shot
npm run test:coverage         # + coverage report
npm run test:security         # security suite only
npm run lint                  # eslint
```

Three kinds of tests:
1. **Unit**: parsers of each provider (winget table, scoop status, npm outdated JSON, helm search…), helpers (`gh-releases.ts`, `install-source.ts`, `normalizeVersion`).
2. **Security pins**: `shell-usage.test.ts` (allowlist of `shell: true`), `http-targets.test.ts` (https-only), `install-source.test.ts` (binary ↔ PM mappings).
3. **Integration**: very limited — the CLI shells out to real tools that may not be installed in CI.

Strict conventions: `tsconfig.json` enables `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`. No `as` cast unless necessary, no `any`. Code review: "no comments stating WHAT, only WHY when non-obvious".

---

## 17. Build & distribution

### Stack

- ESM TypeScript, strict `tsconfig.json`.
- Bundler: `tsup` (minimal config, single bundle, `dist/cli.js`).
- Distributed via npm as `@charles_lindecker/gup`. `git clone` + `npm install && npm run build && npm link` is also supported for local hacking.

### npm scripts

```
dev              # tsx src/cli.ts (no-build dev loop)
build            # tsup → dist/
start            # node dist/cli.js
typecheck        # tsc --noEmit
test, test:run, test:security, test:coverage, test:coverage:ci
lint, lint:security
audit:deps, audit:deps:ci
security         # composite: audit + lint security + tests security
```

### Distribution choice

- Published on npm so end users get a one-liner install. The distributed bundle is small (single file, no public library surface).
- Source install via `git clone` + `npm link` remains the easiest way to audit before running, and is the workflow for contributors.

---

## 18. Extending `gup` — adding a provider in practice

See `CONTRIBUTING.md`. Typical workflow:

```powershell
# 1. Copy the template
Copy-Item src/providers/_template.ts src/providers/<category>/<your-provider>.ts

# 2. Edit the class: id, displayName, installHint, slow?
#    Implement isAvailable(), listOutdated(), update(), updateAll().

# 3. Register in src/core/registry.ts (import + entry in ALL_PROVIDERS).

# 4. Smoke test
npm run typecheck
npx tsx src/cli.ts doctor
npx tsx src/cli.ts list --provider my-tool
```

Conventions to follow:
- One file = one provider. No cross-import between providers.
- No throw inside `listOutdated`/`update`/`updateAll`. Return `[]` or `success: false`.
- Always via `run` / `runInherit`. Never direct `child_process`.
- `fetch` always bounded by `AbortSignal.timeout(5_000)`.
- `slow: true` if the scan does HTTP-per-package or an FS walk.
- `skipped: true` when the update needs a human action.
- Strict TypeScript, no unnecessary casts.
- Docs / code / identifiers in English; user-facing CLI strings in French (primary FR audience).

---

## 19. Summary — the mental map in one sentence

> **`gup`** is an **orchestrator CLI** that aggregates ~150 **Providers** (one file = one installation source), each implementing a 4-method contract (`isAvailable` / `listOutdated` / `update` / `updateAll`); the Providers are **fan-out scanned** in parallel via `pLimit(4)` behind a live spinner; results are **fail-soft** (a broken provider only affects its own cell); updates are **stream-inherit** to the user's terminal; recoverable failures go through a **progressively aggressive opt-in retry menu**; the entire shell-out surface is locked down by security tests + SAST + dependency audit + secret scanning.

---

## Appendix A — Contract recap

| Concept | Type | Where | Invariant |
|---|---|---|---|
| `Provider.id` | `string` (kebab-case) | provider class | unique across `ALL_PROVIDERS`, stable |
| `Provider.slow` | `boolean?` | provider class | declarative; gated by `--fast` |
| `OutdatedPackage.manual` | `boolean?` | output of `listOutdated` | filtered in `scanAll`, never user-visible |
| `UpdateOutcome.success` | `boolean` | output of `update` | `false` ↔ failure OR skip |
| `UpdateOutcome.skipped` | `boolean?` | output of `update` | requires `success: false`; yellow SKIP |
| `UpdateOutcome.retryable` | `boolean?` | output of `update` | requires `success: false`; triggers retry menu |
| `UpdateOptions.force` | `boolean?` | input of `update` | never set by default, opt-in user only |
| `UpdateOptions.uninstallPrevious` | `boolean?` | input of `update` | destructive, opt-in user only |
| `UpdateOptions.reinstall` | `boolean?` | input of `update` | destructive, last resort, opt-in user only |
| `ScanOptions.concurrency` | `number?` | input of `scanAll` | default 4 |
| `ScanOptions.only` | `string[]?` | input of `scanAll` | restriction by provider id |
| `ScanOptions.fast` | `boolean?` | input of `scanAll` | skip `slow` ones |

---

## Appendix B — User command → code mapping

| User command | Entry | Logic |
|---|---|---|
| `gup` | `program.action` | `menuCommand()` REPL |
| `gup list` | `program.command("list")` | `listCommand()` |
| `gup list --json` | idem | bypass renderScanTable, `JSON.stringify(scanAll)` |
| `gup list --fast` | idem | `fast: true` passed to `scanWithProgress` |
| `gup list --provider winget npm-g` | idem | `only: ["winget", "npm-g"]` |
| `gup update` | `program.command("update")` | `updateCommand()` → interactive checkbox |
| `gup update --all` | idem | every scanned package selected |
| `gup update --all -y` | idem | + skip confirm + skip retry menu |
| `gup update winget:Microsoft.PowerShell` | idem | `runTargets(["winget:Microsoft.PowerShell"])`; no scan |
| `gup doctor` | `program.command("doctor")` | `doctorCommand()` |
| Ctrl+C inside a prompt | global catch | `ExitPromptError` → exit 130 |
| Fatal error | global catch | `chalk.red("Error:")` + exit 1 |

---

*End of document. All path references are valid as of the repo snapshot. Major updates to the model (new `OutdatedPackage`/`UpdateOutcome` type, scan-engine overhaul) must be reflected here.*
