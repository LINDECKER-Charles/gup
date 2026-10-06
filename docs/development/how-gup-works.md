# How `gup` works — End-to-end technical walkthrough

> Source document for the explanatory site. Aimed at intermediate / advanced developers. Covers
> `gup`'s operation from end to end: motivation, model, command lifecycle, internal contracts,
> resilience patterns, build. The diagrams — layers, scan, update pipeline, the interactive app's
> states, scheduling, data flow — are in [`architecture.md`](architecture.md); this page walks
> through the code that implements them and links there instead of drawing them twice.
>
> Repo: `LINDECKER-Charles/gup` · Stack: strict TypeScript (Node ≥ 26.9), ESM, `execa`,
> `commander`, `@opentui/core`, `node-pty` (optional), `croner`, `chalk`, `cli-table3`, `p-limit`,
> `adm-zip`. No browser runtime: `gup` with no subcommand is a full-screen OpenTUI app drawn by
> OpenTUI's native renderer, loaded on demand through `node:ffi`; the one-shot commands stay plain
> line output; the HTML report is a static file the user's browser opens.

---

## 0. Elevator pitch

`gup` ("Global Updater") is a **unified CLI** that scans, in parallel, 153 installation sources
(OS package managers, runtimes, dev tools, IDE extensions, cloud / IaC / Kubernetes CLIs…), lists
everything that is outdated, then runs each source's own update command.

It is deliberately an **orchestrator of existing tools**. `gup` does not invent an update
protocol and ships no version cache: it **shells out** to `winget upgrade`,
`npm outdated -g --json`, `helm repo update`, `pip list --outdated --format json`, etc., and
homogenizes their heterogeneous outputs behind one interface.

Four ways to use it:

1. **Interactive app** (bare `gup`) — a full-screen app: scan, check packages, update them inside
   the app with a live terminal per install, schedule them, browse the activity journal, change
   the theme and settings.
2. **Non-interactive** (`gup list`, `gup update --all -y`, `gup report`, `gup log`) — suitable for
   scripts and CI.
3. **Targeted** (`gup update winget:Microsoft.PowerShell npm-g:typescript`) — bypasses the scan.
4. **Scheduled** (`gup schedule add …`) — the OS starts a short-lived `gup` every 15 minutes
   while a schedule is enabled; it updates the chosen packages when they are due.

---

## 1. Why `gup` exists — the business problem

On a modern dev workstation, a binary may come from **dozens of competing sources**, each with:

- Its own update-listing command (`winget upgrade`, `npm outdated -g --json`, `pipx list`,
  `scoop status`, `helm repo update && helm search repo`, `gem outdated`, `dotnet tool list -g`,
  `cargo install --list`, `cs update --installed`, `kubectl version`, etc.).
- Its own output format (fixed-width text table, JSON, JSONL, YAML, localized human output…).
- Its own edge cases: `winget` silently ignores "pinned" and "unknown version" packages; `ncu -g`
  only sees npm; cloud CLIs (`az`, `gcloud`, `aws`) each have their own `self-update` subcommand;
  HashiCorp tools (`terraform`, `vault`, `consul`, …) have no built-in updater at all and must be
  compared to their releases feed.

Observation: **no native tool covers the entire surface**. The practical consequence for a
developer is 10–15 commands to chain by hand, several times a month, without knowing which one
forgot what.

`gup` reduces this to **one command** + a parallel scan + one update pipeline.

### Boundaries

What `gup` is *not*, and the sources it deliberately leaves alone — Windows Update, macOS system
updates, Apple's SIP-frozen Ruby, project lockfiles, Toolbox-managed IDEs — each with the
reasoning behind the exclusion: [`scope.md`](../guide/scope.md).

---

## 2. Vocabulary / key concepts

| Term | Definition |
|---|---|
| **Provider** | Isolated module that knows how to handle **one** installation source. One file = one provider. Implements the `Provider` interface (`src/core/types.ts`). Examples: `WingetProvider`, `NpmGlobalProvider`, `HelmProvider`. |
| **Provider id** | Stable kebab-case identifier, unique across the registry. Used at the CLI: `gup update <provider-id>:<packageId>` (e.g. `winget:Microsoft.PowerShell`). |
| **Platform set** | The OSes gup supports a provider on (`PLATFORMS.windows`, `macos`, `notWindows`; omitted = everywhere). Elsewhere the provider is never probed, scanned or updated, and listings grey it out. |
| **OutdatedPackage** | One scan-result entry: `{ id, name?, current, latest, note?, installedBy?, manual?, requiresAdmin?, aggregate? }`. The **currency** between the provider layer and everything above it. |
| **UpdateOutcome** | Result of an update: `{ id, success, skipped?, message?, retryable?, recovery? }`. |
| **ProviderScanResult** | Per-provider aggregate after a scan: `{ providerId, available, packages[], error? }`. |
| **slow** | Declarative flag on a provider whose scan does HTTP per package or a heavy filesystem walk. Skipped in `--fast` mode. |
| **manual** | Flag on an `OutdatedPackage`: no command can update it. Filtered out by `scanAll` → never shown, never updated. |
| **requiresAdmin** | Flag on an `OutdatedPackage`: its update needs UAC or `sudo`. The pipeline runs every such package in one elevated batch, behind one prompt. |
| **aggregate** | Flag on an `OutdatedPackage` whose update acts on the whole provider ("all plugins"): never a scheduling target. |
| **skipped** | Flag on an `UpdateOutcome`: the update was abandoned on purpose (the user skipped it, a timeout, missing rights, a GUI-only tool). Shown `→`, distinct from a failure `×`. |
| **retryable** | Flag on an `UpdateOutcome`: the failure might pass with a more aggressive strategy (`--force`, `--uninstall-previous`, two-step reinstall). Triggers the retry offer. |
| **Install sink** | Where an install's terminal I/O goes: the user's terminal, a pane of the embedded terminal, or a pipe to the debug log. Providers never know which. |
| **Batch lock** | One update batch at a time per user, across processes (the menu, `gup update`, a scheduled tick). |
| **Schedule** | A named list of `provider:packageId` targets plus a recurrence, run by the OS-started `gup __schedule-tick`. Never a whole provider. |
| **CLI module** | A feature's plug into the command line: its commands, global options, startup wiring and `gup doctor` line (`src/commands/cli/`). |
| **View** | A sidebar entry of the interactive app (`ViewDefinition`), registered in `src/commands/menu-views.ts`. |
| **Locale** | The language a process speaks, `en` (the default) or `fr`, chosen once at startup (`src/core/i18n/`). Every user-facing text is read in it when it is shown. |

---

## 3. Bird's-eye architecture

The layers, who depends on whom, and the source tree are in
[`architecture.md` §2](architecture.md#2-layers-and-responsibilities) and
[§14](architecture.md#14-tree-layout). Three principles hold everything together.

### Guiding principle #1: **provider isolation**

> One file = one provider. **No cross-imports** between providers. No shared state.

A provider that breaks (parser broken by a new upstream version, HTTP timeout, uncaught
exception) **only affects its own row**. `scanAll` wraps every `listOutdated()` call in a
`try/catch` that turns a throw into `ProviderScanResult.error`; the update pipeline turns a
rejected `update()` into a failed outcome. The other providers carry on.

### Guiding principle #2: **shell out only through `runner.ts`**

> No direct `child_process`, no `execa` outside `src/core/runner.ts`.

`run()` / `runInherit()` centralize: forced UTF-8 (otherwise `winget` and `choco` render mojibake
under cp65001), `windowsHide: true`, `reject: false` (never throw on a non-zero exit), an explicit
argv vector (never `shell: true`), argument sanitisers, timeouts and process-tree kills. The one
provider that needs `shell: true` (Scoop, whose entry point is a PowerShell shim) is **pinned by
an allowlist** in `tests/security/shell-usage.test.ts`. Installs that run in the embedded terminal
go through the same `runInherit`, inside a trampoline (§7).

### Guiding principle #3: **fail-soft, never-throw**

> `listOutdated` and `update` **should never throw**. They return `[]` or
> `{ success: false, message }`.

An uncaught exception is caught anyway — by `scanAll` for a scan, by `applyUpdate` for an update —
but the contract is: if you can't, return empty or failed with a clear message.

One deliberate exception: when the tool **itself reports** that its scan failed — npm's
`{"error": {"code": "E503", …}}` report, a pnpm `ERR_PNPM_…` code with no report — `listOutdated`
throws an `Error` that names it (`npm outdated failed (E503): …`). `scanAll` turns it into the
provider's scan error, shown as such in Scan, Packages (whose title bar then counts failed scans
instead of saying `up to date`) and `gup list` / `gup update`, where returning `[]` would have
read as "nothing outdated". Output the parser cannot make sense of — empty, garbage, an exit code
alone — still means "nothing to report": the contract tests' fault sweep holds every provider to
it.

---

## 4. Full command lifecycle

`src/main.ts`, which `src/cli.ts` loads, first chooses the interface language (§9.1), then builds a
Commander program from the CLI modules (`src/commands/cli/cli-modules.ts`). Before any command runs, the startup hook
records what started the process (`menu`, `cli` or `schedule`) and runs every module's
`beforeAction` in order: the root guard (a run under `sudo` stops there, before anything is
written), the debug log, the settings (theme engine, menu preferences, install timeout), the
scheduler (batch lock), then the commands' own (§9.1).

### 4.1 `gup` (bare command — interactive app)

```
1. commander parses argv → no subcommand → menuModule's action → menuCommand()
   (src/commands/menu.ts) builds the MenuState from the persisted scan settings
   and runs MenuApp (src/ui/app/menu-app.ts) with the views of menuViews().

2. MenuApp loops over sessions, each on the terminal's alternate screen
   (one OpenTUI renderer per session, destroyed when it ends):
     MenuSession = title bar · sidebar · view in front · key-hint bar · dialogs
     └─ on start (scan at launch on): controller.scan(state, scan events)
           └─> runScan({ fast, only? }, events)          (src/ui/scan-progress.ts)
                 ├─ detectAvailableProviders()           (platform gate, bounded probes)
                 ├─ scanAll(...) with per-provider start / end events
                 └─ recordScan(...) + scan.* debug-log events
           the Scan view draws it live, then Packages comes to the front

3. Inside a session (↑↓ · Tab · ← · q, mouse clicks and wheel):
     - Scan          → live progress, then the result per provider; r rescans
     - Packages      → outdated packages by provider; space / click check, a all,
                       / filter, Enter update the checked set, p schedule it
     - Schedules     → schedules: edit, enable, delete, run now, repair the trigger
     - Providers     → detected / not installed / incompatible with this OS
     - Journal       → activity heatmap, recurrence, events, debug log, HTML report
     - Options       → settings, theme picker, colour editor, file
     - Quit / q      → the session ends "quit" → exit 0

4. Enter in Packages → ctx.updates.launch(checked packages)
     in-screen launcher (embedded terminal available):
       confirmation → the run view takes over the body → runUpdates(...) with the
       run view's ports and the PTY sink → results → back to Packages, the updated
       packages dropped (no rescan)
     outside launcher (fallback): the session ends "outside"; MenuApp runs the
       update on the plain terminal, waits for "Press Enter to return to gup…",
       then opens a new session
```

The navigation and the run view's states are drawn in
[`architecture.md` §7](architecture.md#7-interactive-app).

### 4.2 `gup list`

```
listCommand({ only?, fast?, json? })
  ├─ warnIgnoredProviders(only)            (a --provider id foreign or unknown → stderr)
  ├─ if json → scanAll() + recordScan(), JSON.stringify(results) on stdout (no screen)
  └─ else    → scanWithProgress() + renderScanTable()
```

No prompt, no install. The scan is recorded in the history. Always exits 0: a provider that fails
to scan is reported in its row, not as a process failure.

### 4.3 `gup update [targets...]`

```
updateCommand({ all, yes, only, fast, targets })

(a) targets given:
    → resolveTargets: resolveUpdateTarget per target (core/platform/update-target.ts):
      "provider:packageId", no empty or `-…` package id, no control character,
      lookupProvider (unknown or foreign) → any refusal exits 2
    → updateOnConsole(requests)            no scan

(b) --all:
    → scanWithProgress → every package → confirmation (unless -y; declined → exit 1)
    → updateOnConsole(requests)

(c) neither:
    → scanWithProgress → package picker (the Packages table on its own screen)
    → updateOnConsole(requests)            nothing checked → "Nothing selected.", exit 0

updateOnConsole = a Ctrl+C skip session + runUpdates(requests, consolePorts)
                  + printReport → exit 0, or 1 when anything failed
```

`runUpdates` is the pipeline the menu and the scheduler use too
([`architecture.md` §6](architecture.md#6-update-pipeline)).

### 4.4 `gup doctor`

```
doctorCommand()
  ├─ readProviderStatus()                  every provider: detected / missing / incompatible
  ├─ renderProvidersStatus(report)         the three groups, install hints for the missing
  └─ "System": each module's diagnostics() (5 s each, home shortened to ~)
       Embedded terminal · Debug log · Language · File ownership (POSIX) · Schedules ·
       Configuration
```

No scan, no update. Exits 0.

### 4.5 `gup log`, `gup report`

```
gup log [show]   → readLogTail(--lines, --level, --since, --grep)  → readable lines or --json
gup log path     → the log directory
gup log export   → diagnostic .zip: the period's log files (re-redacted), system.json,
                   history-summary.json (insights only), README.txt
gup report       → exportHistory(): read the history → buildInsights → serialise
                   html (default; a file, opened in the browser) · text · json · csv
```

Reading the log never writes to it: the journal module installs no backend for `gup log`.
Details: [`journal-and-reports.md`](../guide/journal-and-reports.md).

### 4.6 `gup schedule`, `gup __schedule-tick`

```
gup schedule add|remove|enable|disable   → validate, save schedules.json, then reconcile the OS
                                           trigger (registered with the first enabled schedule,
                                           removed with the last one)
gup schedule list|status [--json]        → schedules, next and last runs, trigger health
gup schedule run-now <id>                → targeted scan, updateOnConsole(..., -y semantics),
                                           recorded as the schedule's last run
gup schedule install|uninstall           → register or repair / remove the trigger

gup __schedule-tick (hidden, started by the OS):
  GUP_NONINTERACTIVE=1 · no colours · boot grace · cwd = scheduler dir · clamped timeout
  → ScheduledRun.tick(): heartbeat → re-check stored schedules → batch lock (never waits)
    → due occurrences consumed → scan only the targets' providers → runUpdates with
      HEADLESS_DECISIONS in a pipe sink → per-schedule summary → exit
```

The tick's sequence and the OS triggers are in
[`architecture.md` §10](architecture.md#10-scheduling).

### 4.7 `gup language`

```
gup language [code]                         (commands/cli/language-module.ts)
  ├─ no code → resolveLocale(GUP_LANG, interface.language)
  │            → "Language: English (default)", the codes gup speaks, how to change it
  └─ a code  → parseLocale: its primary subtag, any case (fr, FR, fr_FR.UTF-8) → unknown: exit 2
               → settings.update("interface", { language }) → cannot be saved: exit 1
               → setActiveLocale, confirm in the new language
               → GUP_LANG still decides in this shell? say so on stderr
```

The same choice, made once by `main.ts` at every start (§9.1), is what every other command speaks;
`gup doctor` reports it on its "Language" line, a warning when `GUP_LANG` named a language gup
does not speak. Where the language comes from in each process, and what follows it:
[`architecture.md` §15](architecture.md#15-interface-language).

---

## 5. The **Provider** contract — anatomy in detail

The heart of `gup`. The value of the project lies in the quality and isolation of the 153
implementations of this interface.

```ts
export interface Provider {
  readonly id: string;                    // kebab-case, unique, stable (CLI key)
  readonly displayName: string;           // shown in tables and the app — short, no marketing
  readonly installHint?: string;          // shown by `gup doctor` when not detected
  readonly slow?: boolean;                // true ↔ HTTP per package, heavy FS walk
  readonly platforms?: PlatformSet;       // PLATFORMS.windows | macos | notWindows; omitted = all
  readonly canUpdateUnattended?: boolean; // false ↔ every update needs an administrator

  isAvailable(): Promise<boolean>;
  listOutdated(): Promise<OutdatedPackage[]>;
  update(packageId: string, options?: UpdateOptions): Promise<UpdateOutcome>;
  updateAll(packages: OutdatedPackage[], options?: UpdateOptions): Promise<UpdateOutcome[]>;
}
```

### 5.1 `isAvailable()` — detection

Must return **fast**, with no network I/O. Standard strategy: `commandExists("<binary>")`, which
resolves `PATH` in-process (no `where`/`which` spawn: on Windows a burst of ~140 synchronous
spawns froze the event loop for seconds). The registry runs 8 probes at a time and gives each
15 s; a probe that never answers counts as "not installed".

`isAvailable()` never tests the OS: a provider that only exists on some platforms declares
`platforms`, and the registry never calls it elsewhere (§5.6).

Edge cases:
- Providers that depend on a **config folder** rather than a binary (e.g. `nvim-lazy` detects
  `~/.local/share/nvim/lazy` or the Windows equivalent) use `access()` from `node:fs/promises`.
- WSL providers: available if `wsl.exe` responds **and** a distro running the target package
  manager is listed. See `src/core/wsl.ts`.

### 5.2 `listOutdated()` — the scan

The most complex and most variable method. The contract:

1. **Never throw.** On a parse error, an HTTP timeout, a broken package manager: return `[]`.
2. **Only emit truly outdated packages.** `current === latest` must be filtered out.
3. Build each `OutdatedPackage` with:
   - `id`: identifier usable by `update(id)` (provider-local).
   - `name?`: human-readable name when different from id.
   - `current` / `latest`: strings as emitted by the tool, **un-normalized** (the UI displays them
     as-is — semantic comparison happens inside the provider via `normalizeVersion()`).
   - `note?`: free-form extra info (`"pinned"`, `"unknown version"`, `"source: msstore"`…).
   - `installedBy?`: the package manager a delegating provider hands the update to, spread from
     `installedByField(source)`; a row Homebrew installed gives way to brew's own in `scanAll`.
   - `manual?: true`: no command can update it; filtered by `scanAll`.
   - `requiresAdmin?: true`: the update needs UAC or `sudo` (Chocolatey through
     `flagForElevation`; on macOS and Linux MacPorts, Fink, pkgin and the apt/dnf delegations).
   - `aggregate?: true`: updating the row updates the whole provider.

#### Pattern A: the tool exposes JSON

The happy path. Example `NpmGlobalProvider`:

```ts
const { stdout } = await run("npm", ["outdated", "-g", "--json", "--long"]);
const parsed = JSON.parse(stdout) as Record<string, NpmOutdatedEntry>;
return Object.entries(parsed)
  .filter(([, info]) => info.current && info.latest && info.current !== info.latest)
  .map(([name, info]) => ({ id: name, name, current: info.current!, latest: info.latest! }));
```

No regex, no positional parsing.

#### Pattern B: the tool only emits a text table

`WingetProvider`, `ScoopProvider`. Technique: locate the **header line**, compute column offsets
from each header's position, then slice each line on those offsets. Resilient to localized
labels (French and English Windows).

#### Pattern C: no "list outdated", but `--version`

Typical for HashiCorp tools, cloud CLIs, most dev tools (`lazygit`, `jj`, `delta`…). The
provider:

1. Reads the installed version via `<bin> --version`.
2. Fetches the upstream version through an API (GitHub Releases, HashiCorp releases, npm
   registry, PyPI…), bounded by `AbortSignal.timeout(5_000)`.
3. Compares with `normalizeVersion()` (trim a leading `v`, lowercase).
4. Produces **at most one** `OutdatedPackage` (the tool itself).
5. `update()` delegates to the package manager that owns the binary via `delegateUpdate()`
   (`core/install-source.ts`).

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

These providers are **flagged `slow = true`** (one HTTP call per scan).

#### Pattern D: `helm repo update` + `helm search repo --versions` (Kubernetes/Helm)

Helm has no built-in "outdated". The technique is to `helm repo update`, then for each installed
release compare the local version to the `version` field of
`helm search repo <chart> --versions -o json`. Expensive → `slow`.

#### Pattern E: WSL bridge

Providers `wsl-apt`, `wsl-dnf`, `wsl-pacman`, etc. wrap `wsl.exe -d <distro> -- <linux-command>`.
The helper `src/core/wsl.ts` handles distro detection (`wsl.exe -l -q`, decoded from UTF-16) and,
when several distros run the same package manager, compound ids (`apt:<distro>:<pkg>`).

### 5.3 `update(packageId, options?)` — one package

Receives a `packageId` (from `OutdatedPackage.id`, a typed target or a schedule) and **always**
returns an `UpdateOutcome`:

```ts
interface UpdateOutcome {
  id: string;
  success: boolean;
  skipped?: boolean;    // abandoned on purpose: user skip, timeout, missing rights, GUI-only
  message?: string;     // reason for failure / skip
  retryable?: boolean;  // could pass with a more aggressive strategy
  recovery?: string;    // what the provider undid after an unfinished attempt (kept past a skip)
}

interface UpdateOptions {
  force?: boolean;              // bypass the installer hash check (winget --force)
  uninstallPrevious?: boolean;  // winget --uninstall-previous (destructive)
  reinstall?: boolean;          // last resort: uninstall + install in two commands
}
```

`force`, `uninstallPrevious` and `reinstall` are NEVER set on a first attempt: only after the
user explicitly picks a retry strategy (§10).

Typical implementation:

```ts
async update(packageId: string, options?: UpdateOptions): Promise<UpdateOutcome> {
  const args = ["upgrade", "--id", packageId, "--exact", "--silent",
                "--accept-package-agreements", "--accept-source-agreements",
                "--include-unknown", "--disable-interactivity"];
  if (options?.force) args.push("--force");
  if (options?.uninstallPrevious) args.push("--uninstall-previous");
  const res = await runInherit("winget", args);
  return res.failed
    ? { id: packageId, success: false, retryable: true }
    : { id: packageId, success: true };
}
```

Notes:
- `runInherit` gives the installer a terminal: the user's own, a pane of the embedded terminal
  (in the app) or a pipe to the debug log (scheduled runs), whichever install sink is active.
  Progress bars, licence prompts and warnings stay visible. The provider does not know which.
- Don't confuse with `run()`, which captures stdout/stderr in memory (used for parsing in
  `listOutdated`).

### 5.4 `updateAll(packages, options?)` — bulk

The contract keeps a bulk entry point: when the tool supports a grouped upgrade, the provider may
use it and map the single result to one outcome per package; otherwise `updateAll` loops over
`update`. The contract harness checks its shape for every provider.

gup's own paths do not call it: the update pipeline calls `update()` once per package, so a skip,
a timeout or a refusal drops one install while the rest of the batch goes on, and each attempt is
recorded on its own.

### 5.5 `manual: true` vs `skipped: true`

Two orthogonal concepts:

- **`manual: true`** is set on an `OutdatedPackage` by `listOutdated`: "this package is outdated,
  but I already know no automatic command will work". `scanAll` **filters them out** — the user
  never sees them. A source whose items would **all** be `manual` gets no provider at all (§14.4).
- **`skipped: true`** is set on an `UpdateOutcome`: "I tried, and stopped on purpose". The user
  sees `→` (`SKIP` in console output), distinct from `×` (`FAIL`).

### 5.6 `platforms` — where a provider exists

`readonly platforms = PLATFORMS.windows;` (or `macos`, `notWindows`) — one line, a named set.
35 providers declare one; the registry applies it everywhere (detection, scan, `gup update`
targets, schedules, the elevated child) and listings show the provider in a greyed
"Incompatible with …" group. `tests/core/platform/platform-gate-source.test.ts` (TypeScript AST)
fails when a provider reads `process.platform` in `isAvailable()` or keeps an install hint for an
OS it does not run on. Path building that depends on the OS uses `pathFlavour(platform)`, never
`path.join` inside a platform branch.

---

## 6. The scan engine — `core/registry.ts`

### 6.1 `ALL_PROVIDERS`

A static list of instances. The order **drives the display order** in `gup doctor` and in the
scan table; it is organized by category for readability.

```ts
export const ALL_PROVIDERS: Provider[] = [
  new WingetProvider(), new ScoopProvider(), new ChocoProvider(),
  new WslProvider(), new WslAptProvider(), /* ... */
  new NpmGlobalProvider(), /* ... 153 entries ... */
  new SelfProvider(), // always last
];
```

### 6.2 `detectAvailableProviders(candidates?)`

```ts
const supported = candidates.filter((p) => isSupportedOn(p));     // the platform gate
const limit = pLimit(8);                                           // DETECTION_CONCURRENCY
// each probe under its operation context, raced against a 15 s timer: a wedged probe
// (wsl.exe waiting on a stopped distro) counts as "not installed" instead of hanging
```

Fail-soft: a probe that throws is "not installed". The scheduled tick passes only the providers
its due targets name.

### 6.3 `getProvidersToScan(options)`

Filters the detected providers by the platform gate, `--provider` (`options.only`) and `--fast`
(`p.slow`). `options.detected` lets a caller that already ran detection skip it.

### 6.4 `scanAll(options)` — the orchestrator

```ts
const limit = pLimit(options.concurrency ?? 4);
const raw = await Promise.all(
  filtered.map((p) =>
    limit(() => withOperation({ op: "scan", providerId: p.id }, () => scanProvider(p, options))),
  ),
);
const { results, exclusions } = await filterByOwnership(raw);   // §8.5
const deduplicated = dropSuperseded(results);                    // core/superseded.ts
```

`scanProvider` calls `onProviderStart`, wraps `listOutdated()` in a `try/catch` (a throw becomes
`error: string`), drops `manual` rows, then calls `onProviderEnd`. `dropSuperseded` then keeps
software two providers list with the one that updates it — a row `installedBy: "brew"` gives way
to brew's own once brew scanned.

Invariants set here:
1. **Concurrency 4 by default** — no machine saturated by subprocesses.
2. **The `try/catch` is in the engine, not in the provider** — the last line of defence.
3. **`manual` is filtered here, once** — nothing downstream needs to know it exists.
4. **Every scan runs under an operation context** — what a provider spawns or logs during a
   concurrent scan is attributed to it in the debug log.

---

## 7. The runner — `core/runner.ts`

All interaction with the system happens through this module (and its `process/` helpers):

```ts
// Capture stdout/stderr — used by listOutdated(); stdin closed, 180 s cap, tree kill
async function run(command, args = [], options = {}): Promise<RunResult>

// Give the install a terminal — through the active install sink (terminal, PTY pane, pipe)
async function runInherit(command, args = [], options = {}): Promise<RunResult>

// PATH resolution, in-process — used everywhere in isAvailable()
async function commandExists(command): Promise<boolean>
async function whichFirst(command): Promise<string | null>

// Elevation probe: `net session` on Windows, getuid() === 0 on POSIX
async function isElevated(): Promise<boolean>

// Open a file with the OS (the HTML report): absolute opener, argv, detached, no shell
async function launchDetached(command, args): Promise<…>
```

### Key decisions

- **`reject: false`**: execa throws on a non-zero exit by default; here `failed` is inspected by
  hand.
- **`encoding: "utf8"`** on `run()`: without it, Windows on cp65001 returns mojibake (`winget`,
  `choco` especially) and breaks table parsing.
- **`windowsHide: true`**: otherwise every subprocess flashes a console window.
- **stdin closed for probes, a 180 s cap and a process-tree kill**: a probe that prompts or wedges
  can no longer hang a scan.
- **No `shell: true` by default.** The argv vector prevents injection; `sanitizeCommand` and
  `sanitizeArgs` refuse option-like or shell-like values before anything spawns. The one exception
  (Scoop's PowerShell shim) is allowlisted by `tests/security/shell-usage.test.ts`.
- **Exit codes are normalised** to signed 32-bit on Windows, so Visual Studio's "cancelled" code
  and `-1` read the same in every mode.
- **Per-install timeout and skip.** `runInherit` arms the install timeout (`--timeout` >
  `GUP_INSTALL_TIMEOUT` > the `install.timeoutSeconds` setting > 1200 s) and the skip
  (`skipCurrent()`, wired to Ctrl+C on the console and to `s` in the run view); both kill the
  install's process tree and finalise as *skipped*.

### Install sinks and the embedded terminal

`runInherit` builds a sanitised `InheritRequest` and hands it to the active sink, set with
`routeInheritTo(sink)` around a batch:

| Sink | Set by | What the install gets |
|---|---|---|
| none (default) | — | the user's terminal, stdio inherited |
| PTY (`core/pty/pty-sink.ts`) | the in-screen launcher | a pane of the run view, through node-pty |
| pipe (`createPipeSink`) | the scheduled tick | stdin ignored, output lines to the debug log (256 KiB per stream) |

The PTY sink never lets node-pty start an installer: node-pty starts `node dist/pty-exec.js
<base64url payload>`, and that **trampoline** calls `runInherit` again with no sink, so PATH
resolution, `.cmd` escaping and the argv barrier are exactly those of a normal install. On
Windows the trampoline reports a successful exit through a private result file, which settles an
install in about 250 ms instead of waiting for ConPTY's one-second output flush; each session
releases its pseudo-console when the installer exits (node-pty 1.1.0 alone leaves one
`conhost.exe` and a worker thread behind per session). Detection, failure reasons and the
fallback are in [`architecture.md` §8](architecture.md#8-runner-and-process-seams).

### `RunResult`

```ts
interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  failed: boolean;  // non-zero exit, timeout, signal, skip
}
```

Deliberately flat.

---

## 8. Cross-cutting helpers (`core/`)

### 8.1 `gh-releases.ts`

The most frequent pattern in `gup`: "this tool comes from GitHub, fetch the latest release tag and
compare it to `<bin> --version`".

```ts
fetchGitHubReleaseLatest(ownerRepo, { stripVPrefix = true, timeoutMs = 5000 })
fetchGitHubReleaseTagMatching(ownerRepo, predicate, opts) // kustomize, k3d: prefixed tags
normalizeVersion(v)  // strip "v", lowercase, trim
```

These functions return `null` on a network or HTTP error — **no throw**. 5 s default timeout,
bounded by `AbortSignal.timeout(5_000)`: without it, one GitHub API timeout could hold a scan slot.

### 8.2 `hashicorp-releases.ts`

The equivalent for Terraform / Vault / Consul / Nomad / Packer / Boundary, on
`https://api.releases.hashicorp.com/v1/releases/<product>/latest`.

### 8.3 `wsl.ts`

Detects WSL distros (`wsl -l -q`) and runs Linux commands through `wsl -d <distro> -- …`. Used by
the seven `wsl-*` providers.

### 8.4 `install-source.ts`

Inverse heuristic: given a binary on PATH, guess which package manager installed it, from the
resolved path (`%LOCALAPPDATA%\Microsoft\WinGet\Packages\…` → winget, `~\scoop\…` → scoop,
`/opt/homebrew/Cellar/…` → brew, etc.). Exposed via `delegateUpdate()`, used by providers that do
not self-update and must reroute to their host package manager (e.g. `gh`). Sources: `scoop`,
`choco`, `winget`, `brew`, `apt`, `dnf`, `manual`.

Two POSIX-only refinements sit on top of the path match:

- **Symlink resolution.** Homebrew only exposes a symlink on PATH (`/opt/homebrew/bin/kubectl` →
  `../Cellar/kubernetes-cli/…/bin/kubectl`). Without `realpath`, every brew install would classify
  as `manual` and disappear from the scan on macOS.
- **Package-database probe.** Distro packages live in shared prefixes (`/usr/bin`) that carry no
  ownership signal; `dpkg -S` / `rpm -qf` are the only reliable answer. Only consulted for paths
  under a system prefix, and only on Linux.

The Homebrew classifier is deliberately conservative: `/opt/homebrew` and `.linuxbrew` are
brew-exclusive prefixes, but `/usr/local` only counts with a `Cellar`/`Caskroom` segment. Pinned by
`tests/security/install-source.test.ts`.

### 8.5 `ownership.ts`

Polyglot packages (node, python, go…) can be offered by an OS package manager while a toolchain
manager owns the binary on PATH (`choco:nodejs` while nvm-windows owns `node`). `scanAll` drops
such rows (`filterByOwnership`) so gup never offers an upgrade that would shadow the toolchain
manager's shim; each exclusion is logged at `debug` (`scan.ownership-excluded`).

### 8.6 `corepack-ownership.ts`

Modern pnpm / yarn can be installed directly or shimmed by corepack. Detection looks at whether
the binary's path is inside the corepack directory, so `SelfProvider` never offers a
`pnpm self-update` that would not work on a corepack shim — `CorepackProvider` handles that case.

### 8.7 `nvim-paths.ts`, `install-hint.ts`

Neovim directories per OS (`XDG_DATA_HOME`, `%LOCALAPPDATA%\nvim-data`…) for the `nvim-*`
providers; the install hint matching the running platform, so `gup doctor` never suggests
`winget install …` on a Mac.

---

## 9. Commands — `commands/`

### 9.1 `cli.ts` and the CLI modules

`cli.ts`, the installed entry point, first checks the running Node against `MIN_NODE`
(`core/node-floor.ts`): on an older one it prints where to get a newer Node and how to reinstall
gup, in the language `GUP_LANG` names, and exits 1 before any module of the program loads.
Otherwise it loads `main.ts`, the program, which tsup bundles on its own (§17). `main.ts` first
chooses the interface language: `applyStartupLocale(argv)`
(`commands/cli/language-module.ts`) takes `GUP_LANG`, then the `interface.language` setting, then
English — the elevated child, which never reads the settings, starts from `GUP_LANG` and takes its
parent's language from the batch payload (§9.6). It comes first because the help, the commands'
descriptions and commander's own words are read as the program is built. `main.ts` then parses
the program `createProgram` (`commands/cli/program.ts`) assembles: commander localized first
(`commander-locale.ts`: the help's headings and `[command]`, `-h` and `help`, `--version`, and
its usage errors reworded line by line — the words live in `ui/text/cli-labels.ts`, in both
languages), then every module of `CLI_MODULES` (one line each, sorted by id) registered, then the
startup hook. The localized settings come first because commander copies the help and output
configuration into each command when it is created. A module adds its commands and global
options (`register`), answers which trigger a command path is (`triggerFor`: the tick is a
`schedule` run), installs process-wide slots before the action (`beforeAction`), contributes its
`gup doctor` line (`diagnostics`) and hears crashes (`onCrash`). The elevated `__admin-batch`
child runs only the modules that opt in (`runsInElevatedChild`: the debug log), so it never reads
the user's settings.

Global error handling (`startup.ts`): a `PromptCancelledError` (Ctrl+C while a prompt or a screen
holds the keyboard — raw mode turns it into a key, not SIGINT) exits 130 silently; any other
error prints `Error: <message>` on stderr (`Erreur :` in French) and exits 1. A signal while a
screen is up exits 128 + the signal number once the terminal is restored. Standard output's
EPIPE — its reader left, `gup … | head` — exits 0 at once and silently (`broken-pipe.ts`,
installed by `main.ts` before parsing); any other error of that stream still crashes as unhandled.

### 9.2 `list.ts`, `update.ts`, `doctor.ts`

See §4.2–4.4. `update.ts#updateOnConsole` is shared by `gup update`, the menu's outside launcher
and `gup schedule run-now`.

### 9.3 `menu.ts`, `menu-views.ts`, `menu-state.ts`

`menuCommand()` builds the `MenuState` (`scans`, `fast`, `filter`, `detectedCount`, `providers`)
from the persisted scan settings and runs `MenuApp` with `menuController` (scan, outside updates,
display names) and `menuViews()`, the composition root of the views. The state is shared across
sessions; after an update the app drops the updated packages from `scans` (`withoutUpdated`)
instead of rescanning, unless the `rescanAfterUpdate` preference asks for a rescan.

### 9.4 `journal/`

`journal-module.ts` (the `--log-level` option, `gup log`, `gup report`, the log session, the crash
hook and the "Debug log" doctor line), `log-settings.ts` (threshold precedence, the sink
per command), `export-history.ts` (read → insights → serialise → stdout or file; html, text, json,
csv), `journal-source.ts` (the Journal view's data and exports).

### 9.5 `schedule/`

`schedule-module.ts` (the `schedule` commands, the hidden tick, the batch guard for every other
command, trigger healing, the "Schedules" doctor line), `scheduler-services.ts` (stores,
trigger, clock — injectable, so tests never touch the real scheduler), `tick.ts` (the headless
entry), `schedules-controller.ts` (the Schedules view's port).

### 9.6 `admin-batch.ts`

The hidden `__admin-batch <file>` command the elevated batch starts as administrator: reads the
targets, with its parent's install timeout, log threshold and language — which it speaks from
then on —, re-checks each target with `resolveUpdateTarget` — the check `gup update` applies,
since the payload sat in the temp directory — and fails the ones it refuses without running
them, calls `provider.update()` for each other one under its operation context, writes the
outcomes and its debug-log lines back to a file the unelevated parent validates. It never touches the
history and never reads the settings.

---

## 10. Retry strategies — `core/update/retry-pass.ts`

Specific to `winget` in practice, designed generically. `winget upgrade` can fail for reasons a
more aggressive command gets past:

- Installer hash mismatch → `--force` ignores the check.
- Installer technology change (MSI → MSIX) or installed version "Unknown" →
  `--uninstall-previous` uninstalls first.
- `--uninstall-previous` does not trigger → `winget uninstall` then `winget install --force` as
  two commands.

### Mechanism

1. A provider that can be in this case returns `{ success: false, retryable: true }`.
2. Once the direct installs and the elevated batch are done, `retryLoop` collects the retryable
   failures and asks the decisions port which tier to replay them with: a console prompt for
   `gup update`, a dialog in the run view, never for `-y` or a scheduled run.
3. Tiers, least aggressive first (`RETRY_TIERS`): `force` · `force` + `uninstallPrevious` ·
   `force` + `reinstall`. The labels and their risks are in `ui/retry-choices.ts`.
4. "None — leave the failures" leaves them. A tier that ran is never offered again, nor any
   less aggressive one: the loop always moves forward and ends when no tier is left.
5. Each replayed attempt is recorded in the history with its tier (`retry --force`…).

### Why this structure

- **Explicit opt-in**: `--force` disables an integrity check, so it never runs without a human
  saying yes.
- **CI-safe**: `-y` answers "no retry". If a winget update fails in CI, we want to see it.
- **One progression**: no infinite loop, no global state.

---

## 11. The UI layer — `ui/`

### 11.1 The interactive app (`app/`, `views/`, `panels/`)

`MenuApp` loops over `MenuSession`s. A session lays out the chrome (title bar facts, sidebar,
view, key-hint bar), routes keys (`session/menu-keys.ts`: Ctrl+C → dialog → takeover → focused
panel → global keys → panel or sidebar) and owns a `DialogLayer`. Each sidebar entry is a
`ViewDefinition` whose `create(context)` returns a `Panel` — a plain object that renders lines and
takes keys, no terminal of its own. A view reaches the rest of the app through its `ViewContext`
(`state`, `dialogs`, `updates` — the launcher —, `preferences()`, `show(view)`, `rescan()`,
`takeOver(start)`…). Panels never paint colours: they speak in tones (§11.4).

### 11.2 The run view (`run/`)

`RunView` is the takeover of an in-app update: `RunModel` (the pipeline's observer: items, phase,
counts, clock), `RunDialogs` (the decisions: elevation, retry, the stop confirmation, one dialog at
a time), `RunControl` (the abort gate: skip, stop, Ctrl+C twice, the exit signals),
`run-levers.ts` (`s`, `x`, Ctrl+C, `t`), and `terminal/` (`TerminalPanes`, one OpenTUI
`EmbeddedTerminalRenderable` per package, implementing the PTY sink's pane port). `run-keys.ts`
decides who has the keyboard: gup, or the installer while typing (until Ctrl+G).

### 11.3 The screen host (`tui/`)

`screen-host.ts` creates one renderer per screen on the alternate screen (Ctrl+C owned by the
screen, OpenTUI's own signal handling off), mounts it, and in `finally` disposes the appearance,
then destroys the renderer with raw mode held (`teardown.ts`: conhost 10.0.26100 crashes when the
alternate screen is left after stdin went back to line mode). It handles SIGBREAK, SIGTERM, SIGHUP
(and SIGINT on POSIX) while a screen is up. `chrome.ts`, `text-panel.ts` and `dialog.ts` draw the
frame; `styled-lines.ts` turns tone-annotated lines into OpenTUI text.

### 11.4 Theme, glyphs and the interface's words (`theme/`, `text/`)

`theme/` holds the appearance seam (`Appearance`: style, border, background, glyphs, density),
the built-in themes, terminal palette detection and the contrast enforcement
([`architecture.md` §11](architecture.md#11-settings-themes-and-contrast)). `glyphs.ts` maps every
symbol a screen may draw to a one-column ASCII stand-in (`GUP_ASCII=1`, `TERM=linux|dumb`, POSIX
without a UTF-8 locale); a guard test fails on a symbol in `src/ui/` without one. `text/` holds
every user-facing string by domain, each a `localized()` catalog in English and French, and
`format.ts` (counts, durations, dates, relative times — the explicit Intl locale of the interface
language, `en-US` or `fr-FR`, plain spaces, `now` injected).

### 11.5 One-shot output (`prompts/`, `table.ts`, `scan-progress.ts`, `update-console.ts`, `charts/`)

- `scan-progress.ts`: `runScan` (detection, scan, history record, `scan.*` events) and
  `scanWithProgress`, which shows the Scan panel on its own screen (`prompts/scan-screen.ts`) — or,
  piped or redirected, one summary line without ever loading OpenTUI.
- `select.ts`: the package picker of `gup update` — the Packages panel on its own screen
  (`prompts/package-picker.ts`), with the same rules as the menu: `space` or a click checks,
  `a` checks or clears everything shown, `/` filters (checks survive the filter), Enter updates
  the checked set only — with nothing checked it updates nothing and says how to check; `q`
  cancels.
- `update-console.ts`: the console ports of the pipeline (progress lines, the elevation and retry
  prompts) and the final summary.
- `table.ts`: `renderScanTable` (Provider · Package · Current · Latest · Note) and
  `renderProvidersStatus` (detected, missing with hints, incompatible dimmed).
- `charts/`: the heatmap, bars and sparklines shared by the Journal and `gup report --format text`.

---

## 12. `--fast` mode

Many providers do HTTP per package (helm-search, vscode-ext, pwsh-modules, self) or heavy
filesystem walks. On a well-populated machine a full scan takes 30–60 seconds.

`--fast` (or **Options › Fast mode** in the app) **excludes every `slow = true` provider**,
which brings the scan down to typically < 5 seconds. It is **a declarative flag on the provider**,
not a central allowlist: adding a slow provider only means writing `readonly slow = true`.

Typical `slow` providers: `pwsh-modules` (PowerShell Gallery HTTP per module), `vscode-ext`
(Marketplace), `helm-repo` (`helm repo update`), `pip` (PyPI HTTP per package), `self` (npm, PyPI,
GitHub per package manager), every HashiCorp IaC provider (release feed), the Helm chart
providers.

---

## 13. Providers catalog (snapshot)

Canonical source: [`docs/guide/providers-catalog.md`](../guide/providers-catalog.md). Distribution
of the 153 registered providers:

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
| Meta | 1 | self (update of the package managers themselves) |

`providers-catalog.md` details each one — id, upstream source, status — and which OSes it runs
on.

---

## 14. Notable edge cases

### 14.1 `WingetProvider` — localized table parsing

Winget has no JSON mode for `upgrade`. The provider:
1. Reads `winget upgrade --include-unknown --accept-source-agreements`.
2. Looks up the header line with a locale-tolerant regex.
3. Computes column offsets from the header positions and slices each line on them.
4. Cross-references `winget pin list` to annotate `pinned`.
5. Marks `note: "unknown version"` when the installed version is `<` (winget's sentinel).

The update accepts the three retry tiers through `UpdateOptions`; each failure that one of them
could get past is flagged `retryable`. Every winget call carries `--disable-interactivity`: the
one question no flag answers, an install folder the manifest requires (Battle.net), would
otherwise hold the batch in the embedded terminal; refused, it ends as a skip that names the
command to run (`0x8A15005F`).

### 14.2 `ScoopProvider` — the `shell: true` exception

Scoop is a PowerShell script (`scoop.ps1`, exposed through a `.cmd` shim); execa needs
`shell: true` to invoke it on Windows. Injection is neutralized by a strict package-id regex
(`^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)?$`) and by `tests/security/shell-usage.test.ts`, which pins
the exhaustive list of `shell: true` calls.

### 14.3 `SelfProvider` — meta-update of package managers

Surfaces "the package manager itself is outdated": winget, scoop, choco, npm, pnpm, yarn, pip,
pipx, gh, brew. Each target has its own platform set (the `winget`, `scoop` and `choco` targets
are Windows-only, like the providers of the same names). For each one: parse `<bin> --version`,
fetch the upstream version, run the documented self-update command. Ownership quirks: corepack
shims are left to `CorepackProvider`; on Windows with several Pythons, pip's interpreter is
resolved from the physical `pip.exe`; `gh` has no self-update and is delegated through
`install-source.ts`.

### 14.4 Manual-only sources have no provider

JetBrains plugins, Zed extensions, Sublime Package Control, Obsidian community plugins, Unity
editors, Notepad++ plugins and Eclipse p2 features can only be updated through their
application's GUI: every item a provider could list would be `manual: true`, which `scanAll`
filters. A provider would add scan time with no benefit, so these sources are listed as
candidates in [`providers-catalog.md`](../guide/providers-catalog.md), for the day an automatable
update path appears. Until 0.5.0 they existed as unregistered code in `src/providers/ide/`.

---

## 15. Security

The threat model, its mitigations and the tests that pin them are in
[`SECURITY.md`](../../.github/SECURITY.md#threat-model); the architectural chokepoints are listed in
[`architecture.md` §13](architecture.md#13-security).

### Tooling

| Layer | Tool | Config |
|---|---|---|
| Static SAST | CodeQL `security-extended` + `security-and-quality` | `.github/workflows/security.yml` |
| Custom SAST | Semgrep + `p/typescript` + `p/nodejs` | `.github/semgrep.yml` |
| Secrets | gitleaks | `.gitleaks.toml` |
| Dependency vulnerabilities | `audit-ci` (CI) + weekly Dependabot | `.github/audit-ci.json`, `.github/dependabot.yml` |
| Lint | `eslint-plugin-security` | `.github/eslint.config.security.js` |
| Custom pins | Vitest security suite | `tests/security/**` |

`npm run security` chains `audit:deps:ci` + `lint:security` + `test:security`.

---

## 16. Tests

Stack: Vitest (four projects) + v8 coverage, typechecked and linted like `src`. Cross-platform
CI: Windows + macOS + Ubuntu × Node 26. The whole strategy — what each layer fakes, how to run it,
where a new test goes, CI and the manual checklists — is in [`testing.md`](testing.md); in short:

| Layer | Where | What it proves |
|---|---|---|
| Unit | `tests/{core,commands,cli,ui,security,scripts}` | pure logic and builders; the terminal UI on OpenTUI's in-memory test renderer (keys in, frame text out), held to WCAG contrast on every view |
| Providers | `tests/providers/<domain>`, `tests/platform` | every provider on a simulated machine: contract cases (detection, fail-soft under injected faults, argv, `updateAll`), parsers on recorded tool output, every case replayed on each OS it supports |
| Security | `tests/security` | the pins: `shell: true` allowlist, https-only `fetch`, the single spawn chokepoint, argv hardening through `run()` and the embedded terminal, package-id allowlists, the read-only history, report escaping |
| Integration | `tests/integration` | real spawns, a real pseudo-terminal (ConPTY on Windows), the Task Scheduler round trip (opt-in) |
| End-to-end | `tests/e2e` | the built CLI on the real machine, in a sandbox: commands, the menu in a real terminal, a real update in a throw-away npm prefix (opt-in) |

```bash
npm run typecheck             # tsc on src, then on the tests, tooling and configs
npm run test                  # watch: unit + providers
npm run test:run              # unit, providers and integration, once
npm run test:coverage         # + coverage (fails on the safety-critical floors only)
npm run test:e2e:smoke        # build, then the end-to-end smoke
npm run test:security         # security suite only
npm run lint                  # eslint
```

Strict conventions: `tsconfig.json` enables `strict`, `noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes`, `noUnusedLocals`, `noUnusedParameters`. No `as` cast unless
necessary, no `any`. Comments say *why*, never *what*.

---

## 17. Build & distribution

### Stack

- ESM TypeScript, strict `tsconfig.json`.
- Bundler: `tsup`, three entries and three bundles: `dist/cli.js` (the installed entry point,
  which loads the program), `dist/main.js` (the program) and `dist/pty-exec.js` (the PTY
  trampoline, about 9 KB, so an install in the embedded terminal does not pay for loading the
  CLI). Target `node26`; `node-pty` is marked external (an optional native dependency, loaded
  at runtime only).
- Distributed via npm as `@charles_lindecker/gup`. `git clone` + `npm install && npm run build &&
  npm link` is also supported for local hacking.

### npm scripts

```
dev                  # tsx src/cli.ts (no-build dev loop)
build                # tsup → dist/cli.js + dist/main.js + dist/pty-exec.js
start                # node dist/cli.js
typecheck            # tsc --noEmit, on src then on the tests (tests/tsconfig.json)
typecheck:scripts    # tsc on the screenshot generator
test, test:run, test:unit, test:integration, test:security, test:coverage, test:coverage:ci
test:e2e:smoke, test:e2e, test:e2e:mutate   # build, then the end-to-end suites (testing.md §6)
fixtures:record      # re-record provider fixtures from the real tools installed here
screenshots, screenshots:check, screenshots:report   # documentation.md § Screenshots
lint, lint:security
audit:deps, audit:deps:ci
security             # composite: audit + lint security + tests security
```

### Distribution choice

- Published on npm so end users get a one-line install. The package ships `dist/`, the licence
  and the README, whose links lead to the security policy on GitHub; its only install script is
  node-pty's (an optional dependency), which npm 11 asks the user to review — see
  [`installation.md`](../guide/installation.md#npm-11-and-install-scripts).
- Source install via `git clone` + `npm link` remains the easiest way to audit before running, and
  is the workflow for contributors.

---

## 18. Extending `gup` — adding a provider in practice

See [`CONTRIBUTING.md`](../../.github/CONTRIBUTING.md#2-provider-addition-workflow). Typical workflow:

```powershell
# 1. Copy the template
Copy-Item src/providers/_template.ts src/providers/<category>/<your-provider>.ts

# 2. Edit the class: id, displayName, installHint, slow?, platforms?
#    Implement isAvailable(), listOutdated(), update(), updateAll().

# 3. Register it in src/core/registry.ts (import + entry in ALL_PROVIDERS).

# 4. A contract case in tests/providers/<domain>/<domain>.cases.ts

# 5. Smoke test
npm run typecheck
npx tsx src/cli.ts doctor
npx tsx src/cli.ts list --provider my-tool
```

Conventions:
- One file = one provider. No cross-import between providers.
- No throw inside `listOutdated`/`update`/`updateAll`. Return `[]` or `success: false`.
- Always `run` / `runInherit`. Never `child_process`.
- `fetch` always https, bounded by `AbortSignal.timeout(5_000)`.
- `slow: true` if the scan does HTTP per package or an FS walk.
- `platforms` when gup supports the source on some OSes only — never test `process.platform` in
  `isAvailable()`.
- `requiresAdmin` on rows that need UAC or `sudo`; `canUpdateUnattended = false` when every update
  does.
- Strict TypeScript, no unnecessary casts.
- Docs / code / identifiers in English; user-facing strings in English and French, through
  `localize()` or a `localized()` catalog read when shown — an `installHint` with words is a getter
  (`_template.ts` shows both).

---

## 19. Summary — the mental map in one sentence

> **`gup`** is an **orchestrator CLI** that aggregates 153 **providers** (one file = one
> installation source, each gated to the OSes it exists on) behind a 4-method contract; providers
> are **fan-out scanned** four at a time, **fail-soft**; every update — from the menu, the command
> line or a schedule — goes through **one pipeline**: one package per call, one elevated batch
> behind one prompt, an opt-in retry ladder, installs given a terminal through **one runner**
> (the user's terminal, an embedded pseudo-terminal pane, or a pipe); what gup did is **recorded,
> never consulted** for a decision, and shown back as a journal and an HTML report; the whole
> shell-out surface is locked down by drift tests, SAST, dependency audit and secret scanning.

---

## Appendix A — Contract recap

| Concept | Type | Where | Invariant |
|---|---|---|---|
| `Provider.id` | `string` (kebab-case) | provider class | unique across `ALL_PROVIDERS`, stable |
| `Provider.slow` | `boolean?` | provider class | declarative; gated by `--fast` |
| `Provider.platforms` | `PlatformSet?` | provider class | a named set; enforced by the registry only |
| `Provider.canUpdateUnattended` | `boolean?` | provider class | `false` → never scheduled |
| `OutdatedPackage.manual` | `boolean?` | output of `listOutdated` | filtered in `scanAll`, never user-visible |
| `OutdatedPackage.installedBy` | `InstallSource?` | output of `listOutdated` | `brew` → gives way to brew's own row once brew scanned |
| `OutdatedPackage.requiresAdmin` | `boolean?` | output of `listOutdated` | → the single elevated batch |
| `OutdatedPackage.aggregate` | `boolean?` | output of `listOutdated` | never a scheduling target |
| `UpdateOutcome.success` | `boolean` | output of `update` | `false` ↔ failure OR skip |
| `UpdateOutcome.skipped` | `boolean?` | output of `update` | requires `success: false`; `→`, never retried |
| `UpdateOutcome.retryable` | `boolean?` | output of `update` | requires `success: false`; triggers the retry offer |
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
| `gup` | `menuModule` (program action) | `menuCommand()` → `MenuApp` |
| `gup list` | `listModule` | `listCommand()` |
| `gup list --json` | idem | `scanAll` + `recordScan`, `JSON.stringify`, no screen |
| `gup list --fast` / `--provider winget npm-g` | idem | `fast: true` / `only: ["winget", "npm-g"]` |
| `gup update` | `updateModule` | `updateCommand()` → package picker → `updateOnConsole` |
| `gup update --all [-y]` | idem | every scanned package; `-y` skips the confirmation and the retry offer |
| `gup update winget:Microsoft.PowerShell` | idem | `resolveTargets` → `updateOnConsole`; no scan |
| `gup doctor` | `doctorModule` | `readProviderStatus()` + modules' `diagnostics()` |
| `gup log [show\|path\|export]` | `journalModule` | `log-show.ts`, `log-command.ts`, `diagnostic.ts` |
| `gup report` | `journalModule` | `report-command.ts` → `exportHistory()` |
| `gup language [code]` | `languageModule` | `languageCommand()`: show the language, or save `interface.language` |
| `gup schedule …` | `scheduleModule` | `crud-commands.ts`, `report-commands.ts`, `trigger-commands.ts`, `run-now.ts` |
| `gup __schedule-tick` (hidden) | `scheduleModule` | `tick.ts` → `ScheduledRun.tick()` |
| `gup __admin-batch <file>` (hidden) | `adminBatchModule` | the elevated executor |
| `--log-level <level>` | `journalModule` (global option) | `resolveLogSettings()` |
| Ctrl+C inside a prompt | `handleFatal` | `PromptCancelledError` → exit 130 |
| Fatal error | `handleFatal` | `Error: <message>` on stderr, exit 1 |

---

*All path references are valid as of the repo snapshot. A change to the model (a new contract
field, a new pipeline stage) is reflected here and in [`architecture.md`](architecture.md).*
