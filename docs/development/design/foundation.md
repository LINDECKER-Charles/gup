# Design note — the 0.5.0 foundation (`feat/shared-foundation`)

Status: shipped on `feat/shared-foundation`, the first branch of 0.5.0. It builds every extension
point that two or more 0.5.0 features need, so the feature branches (in-app updates, themes and
options, journal and HTML report, scheduled updates, OS-incompatible providers, multi-select)
can work in parallel without editing the same files. This note is the contract those branches
code against; the wave-3 documentation pass folds it into `architecture.md`, `how-gup-works.md`
and `SECURITY.md`.

Read the code for the exact signatures: every contract below lives in one file, named here.

---

## 1. What changed for the user

The foundation is mostly plumbing. These are the only behaviour changes:

| Change | Where |
|---|---|
| Providers foreign to the running OS are never probed nor scanned, and `gup update <id>:x` refuses them with a French reason. Inert until providers declare `platforms` (feature branch). | `core/platform`, registry |
| The menu batches administrator packages behind one UAC / `sudo` prompt, like `gup update`; on macOS/Linux, MacPorts, Fink, pkgin and apt/dnf delegations ask for the password once per batch. | `core/update`, `core/elevation` |
| Windows exit codes are signed 32-bit (Visual Studio's "cancelled" code is recognised again). | `core/runner` |
| The elevated wait is sized to the number of packages (no more waiter killed mid-batch). | `core/elevation` |
| `gup doctor` uses the bounded detection (no hang) and gains a "Système" section, made of the feature modules' diagnostics: no foundation module reports one, so the section stays hidden until a feature branch adds the first line. | `commands/doctor` |
| A skipped install reads `ignorée par l'utilisateur`. | `core/update/finalize-outcome` |
| The focused panel has a heavy border (focus no longer told by colour alone). | `ui/theme/legacy-appearance` |
| The sidebar loses "Tout mettre à jour" and "Cible…" (`a` + Entrée; `gup update provider:id`). | `ui/app` |
| After an update the menu drops the updated packages instead of rescanning; `r` rescans from Paquets. | `ui/app`, `ui/panels/packages-panel` |
| ASCII symbols and borders on `GUP_ASCII=1`, `TERM=linux|dumb`, or POSIX without a UTF-8 locale. | `ui/theme/glyphs` |
| Closing the console, Ctrl+Break or a kill while a screen is up restores the terminal and exits with 128 + signal. | `ui/tui/screen-host` |
| `gup --help` lists the commands in `CLI_MODULES` order (by module id): `doctor`, `list`, `update`. | `commands/cli` |

Everything else — the span intents of every screen, CLI output, exit codes, `--json` — is
unchanged, and tests pin it: `tests/commands/update.test.ts` kept its expectations, except the
three assertions that spied on the deleted `maybeRetryFailures`, which now check the same thing
(no retry question under `--yes` or after a declined confirmation) through the prompt; a
regression test pins the legacy appearance's palette slots. `gup list --json --fast` and
`gup doctor` print byte-identical output on the same machine.

---

## 2. Process-wide slots

A slot is process-wide composition state: one implementation installed at startup, read by
library code. **Only a `CliModule.beforeAction` sets a slot** (never a view, a panel or a
provider). Tests reset every slot they set in `afterEach` (or `onTestFinished`).

| Slot | Set / reset | Default | Installed by (planned) |
|---|---|---|---|
| Install output sink | `routeInheritTo(sink)` → restore; `activeInheritSink()` | the user's terminal | run view (PTY), scheduled run (pipe) — around the work, not at startup |
| Command tracer | `setCommandTracer(t \| null)` | none (one null check) | debug-log module (`createLogTracer()`) |
| Log backend | `installLogBackend(b \| null)`, `applyLogThreshold(level)` | no-op | debug-log module |
| Run trigger | `setRunTrigger()` — startup only; `CliModule.triggerFor()` overrides | `menu` / `cli` | scheduler module (`schedule` for `__schedule-tick`) |
| Batch guard | `setBatchGuard(g \| null)` | pass-through | scheduler module (`createBatchGuard(location)`) |
| Extra update observers | `observeUpdates(o)` → unsubscribe | none | debug-log module |
| Screen defaults | `configureScreens({ createAppearance, rendererOptions } \| null)` | legacy appearance, mouse on | settings module (themes) |
| Menu preferences | `setUiPreferencesSource(s \| null)` | `DEFAULT_UI_PREFERENCES` | settings module |
| Menu launcher | `setLauncherFactory(f \| null)` | `outsideLauncher` | embedded-terminal module |
| Install timeout | `setInstallTimeoutSeconds(s)` | `GUP_INSTALL_TIMEOUT` or `DEFAULT_INSTALL_TIMEOUT_S` | `update` command, settings module |

The elevated `__admin-batch` child runs only the modules that set `runsInElevatedChild`: a slot
installed there runs with administrator rights and must not read the user's settings.

---

## 3. The seams, area by area

### 3.1 Platforms (`src/core/platform/`)

`Provider.platforms?: PlatformSet` (always `PLATFORMS.windows | macos | notWindows`, omitted =
everywhere) is enforced once, by the registry: detection never probes, scanning never runs a
provider foreign to the platform. `isSupportedOn()` is the single predicate;
`lookupProvider(id)` resolves an id for an action (unknown → `Provider inconnu: x`; foreign →
`Provider x indisponible sur Windows (macOS uniquement)`); `readProviderStatus()` sorts every
provider into detected / missing / incompatible through the bounded detection (8 probes at a
time, 15 s each). `pathFlavour(platform)` gives `path.win32` or `path.posix`, so a provider
builds Windows paths correctly when a test simulates Windows on Linux and vice versa.

Provider metadata added here: `canUpdateUnattended = false` (choco, cygwin, npackd, macports,
fink, pkgin, visual-studio) and `OutdatedPackage.aggregate` on rows that update a whole provider.
`UpdateOptions.unattended` makes winget non-interactive.

### 3.2 State, history and run context (`src/core/state/`, `src/core/history/`)

`stateDir(kind)` (`history | logs | reports | scheduler`) and `configDir()` are the one platform
root logic, with `GUP_*_DIR` overrides first (table in `app-dirs.ts`). `run-context.ts` holds
`RUN_ID`, the run trigger, and `withOperation()` / `currentOperation()` (AsyncLocalStorage), which
the registry and `applyUpdate` set so the log backend knows which provider and package a line
belongs to. History records gain `trigger`, per-provider scan `durationMs` and `scheduleId`;
`HISTORY_SCHEMA_VERSION` stays 1. `withFileLock(file, work)` is the short exclusive section of the
config store (`wx` lock file, 10 s staleness). On Windows, `wx` fails with EPERM for a moment
while the previous holder deletes its lock file: that is waited for like a held lock, and only an
EPERM that outlasts every attempt reaches the caller.

### 3.3 Process seams (`src/core/process/`, `src/core/runner.ts`)

`runInherit()` builds a sanitised `InheritRequest` and starts it in the user's terminal or in the
**active install sink** (`InheritSink { mode, start, note }`): the PTY pane and the scheduled
run's pipe plug in there without touching any provider. `createPipeSink()` (stdin ignored, output
as whole lines, byte-capped by `LineSplitter`) is the unattended sink. Skip, timeout and Ctrl+C
drive the sink's `kill()`; `killProcessTree()` is exported for the PTY session. Every spawn is
traced once (`traceCommand`, mode `probe | inherit | pty | pipe`). `launchDetached()` opens a
file with the OS (no shell). `execa` stays imported by `runner.ts` only (drift test).

**Output router** (`installConsole.log/warn`): gup's own lines go to the active sink, else are
deferred to process exit while a full screen is mounted (`setFullScreen`, called by the screen
host only), else to stdout/stderr. Providers never write to the console (drift test).

### 3.4 Log facade (`src/core/log/log.ts`)

`log.error/warn/info/debug/trace(event, data)` with event names `<domain>.<action>`
(`[a-z0-9.-]`, ≤ 48 characters). No backend: a no-op behind one null check; a backend that
throws never reaches the caller. The backend adds time, `RUN_ID`, pid, `currentOperation()` and
redaction. Events emitted so far: `scan.ownership-excluded`, `ui.appearance-failed`,
`ui.appearance-dispose-failed`.

### 3.5 Settings store (`src/core/config/`)

`ConfigStore` with `read`, `write`, `update(section, mutate)` (re-read from disk inside the file
lock, mutate, write atomically), `reset`, `status`, `subscribe`; `configStore()` is
`config.json` under `configDir()` (`GUP_CONFIG=0`: in memory). A feature declares its namespace
with `defineSection()` and a lenient parser (`FieldReader`): a bad field falls back to its
default and records an issue. Machine-local data uses its own file:
`new ConfigStore({ file: join(stateDir("scheduler"), "schedules.json") })`. The elevated child
never reads config.

### 3.6 Update pipeline (`src/core/update/`)

One path for `gup update`, the menu and scheduled runs:
`runUpdates(requestsFrom(selection, { scheduleId }), ports)` plans (direct installs grouped by
provider, then one elevated batch), runs, offers retries, and returns an `UpdateReport`. The
ports are the only coupling to a UI: `UpdateObserver` (planned, started, finished,
elevationStarted, cancelled, waiting), `UpdateDecisions` (`AUTO_DECISIONS` for `-y`,
`HEADLESS_DECISIONS` for scheduled runs: never elevate, never retry, and `unattended` — every
attempt then passes `UpdateOptions.unattended`, so winget runs with `--disable-interactivity`)
and an `AbortGate`.
`updateKeyOf(providerId, packageId)` is the identity of a package across a run, its retries and
the UI. The console side is `ui/update-console.ts` (`consolePorts`, `printReport`);
`commands/update.ts#updateOnConsole` runs it with a Ctrl+C skip session.

**Batch lock** (`batch-lock.ts`): one update batch at a time per user, across processes. The
holder keeps a listening endpoint open — a named pipe on Windows, a unix socket on POSIX — that
the OS releases however the holder exits; a JSON file only carries display information. Both
live in the lock's own state dir, `<state root>/gup/locks` (inside `GUP_SCHEDULER_DIR` when that
is set, so a sandboxed scheduler keeps its own lock), never in the scheduler's folder: an update
does not recreate it after `gup schedule uninstall --purge`. The default guard is a pass-through; the scheduler module
installs `createBatchGuard(location)`.

### 3.7 CLI modules (`src/commands/cli/`)

A feature plugs into the command line with a `CliModule` (`register`, `triggerFor`,
`beforeAction`, `diagnostics`, `onCrash`, `runsInElevatedChild`) and one line in `CLI_MODULES`
(sorted by id). `installStartup()` records the trigger, then runs every `beforeAction` in
`MODULE_ORDER` (logging 10, settings 20, scheduler 50). `gup doctor`'s "Système" section is
made of the modules' `diagnostics()`, each capped at 5 s; doctor prints their values through
the log's `redactText` (home → `~`), since bug reports paste that output, so a module returns
plain paths. `canPrompt()` is false under
`GUP_NONINTERACTIVE=1` (scheduled runs).

### 3.8 Appearance and glyphs (`src/ui/theme/`, `src/ui/tui/`)

Nothing in the TUI builds a colour: panels speak in `Tone` (`plain strong muted disabled accent
success warning danger onAccent`) and `Fill` (`accent highlight`), and the screen's
`Appearance` (`style`, `border`, `background`, `input`, `glyphs`, `glyphMode`, `density`,
`onChange`, `dispose`) paints them. `legacyAppearance` is today's look — ANSI slots, OpenTUI's
default colour for neutral tones, `disabled` painted like `muted`, rounded idle borders and a
heavy focused one, dialogs double. A theme engine provides its own `AppearanceFactory` through
`configureScreens()`.

`Screen` = `{ renderer, tui, appearance, interceptCtrlC(handler) }`. `TextPanel` takes its
border, title colour and padding from the appearance (`panelFrame(density)` replaces
`PANEL_FRAME`) and gains `height` / `setHeight()`. The chrome's `setHints(hints, pinned?)`
fits the hint bar to the terminal: too long, it drops the screen's last hints whole (marked
`…`) and keeps `pinned` — the menu's `tab menu · q quitter`, the picker's `q annuler` — intact.

Glyphs: `STATUS_GLYPHS` (success `✔`, failed `✖`, skipped `↷`, cancelled `⊘`, pending `·`,
running `◐◓◑◒`, scan `⟳`, scheduled `◷`, incompatible `–`, enabled `●`, disabled `○`),
`resolveGlyphMode(preference, env, platform)` and `toAscii()`, a one-character-to-one map applied
where lines become styled text, so layouts never change. `ASCII_BORDER_CHARS` draws idle boxes
with `+-|` and the focused one with `*=|`. A guard test fails when a string literal under
`src/ui/` holds a non-letter symbol without a stand-in: a branch that needs a new glyph adds it to
`glyphs.ts`. The HTML report lives in `src/report/`, outside that guard.

**Screen lifecycle** (`createScreenHost`): renderer → appearance (a throwing factory falls back
to the legacy look, logged) → full-screen flag → mount; in `finally`, `appearance.dispose()` is
awaited **before** `destroyRenderer()` (whose raw-mode hold protects conhost 10.0.26100), then the
flag is released. Ctrl+C is owned by the screen: its listener is registered before the mount, and
it calls the latest `interceptCtrlC` handler or rejects with `PromptCancelledError`. Renderers
are created with `exitOnCtrlC: false` and `exitSignals: []`: while a screen is up, the host
handles SIGBREAK, SIGTERM, SIGHUP (and SIGINT on POSIX) — stop the install in flight, release the
screen as above, exit 128 + signal. The batch lock needs no release there: the exit frees it.
The host knows no batch: `skipCurrent()` only stops the install in flight, and the pipeline would
move on to the next package during the teardown. A launcher that runs a batch inside the screen
(in-app updates) closes its own gate on the same signals while the batch runs, so nothing new
starts before the exit.

### 3.9 Menu: views, session, launcher, preferences (`src/ui/app/`, `src/ui/views/`)

A view is a `ViewDefinition` (`id`, `label`, `order`, `group`, `create(context)`, optional
`badge`, `facts`, `packageActions`, `packageMarkers`) from a factory in `src/ui/views/<id>-view.ts`
(ports as parameters), registered by one line in `src/commands/menu-views.ts`. The sidebar lists
group 0 (work views), a blank row, group 1 (information, settings), a blank row, "Quitter".

A view reaches the menu through its `ViewContext`: `screen`, `state`, `dialogs`, `updates`
(the launcher), `preferences()`, `packageActions()`, `packageMarkers()`, `displayName`, `redraw`,
`show(view)`, `rescan()`, `isScanning()`, `onScansChanged(listener)`, `observeScan(observer)`
and `takeOver(start)`. A takeover (the run view) hides the sidebar and the main panel, gets the
chrome's body, and receives every key after the dialogs plus a frame tick until it is released.
`Panel` gains `wantsKey(key)` (claim ←/→ before the global bindings; `q` and Tab stay global),
`onShow()` (lazy loads) and `hasUnsavedChanges()`: while a view holds changes not saved (the
schedule editor), `q` and "Quitter" ask before the session ends (`QUIT_DIALOG`, default "Non").

Key routing in `MenuSession`: Ctrl+C (the screen's) → dialog → takeover → the focused panel when
it captures text or claims the key → global (`q`, Tab, ←) → panel or sidebar. Which side has the
keyboard and the sidebar cursor live in `MenuNav` (`menu-nav.ts`). The session's frame clock
stops when it ends and when its renderer is destroyed under it (Ctrl+C, a signal).

The hint bar follows the same order: an open dialog's keys (`DialogLayer.hints()`, worded in
`DIALOG_HINTS`) replace those of the screen behind it — in the menu, in the run view and on the
one-shot dialog screens — and `DialogLayer.onChange` redraws as soon as a dialog opens or closes,
also when no key caused it (a launcher's confirmation once its detection answered, a question the
update pipeline asks). While the focused panel captures text it takes `q` and Tab too, so the bar
drops `tab menu · q quitter` (and the picker its `q annuler`).

`UpdateLauncher.launch(packages, { scheduleId?, returnTo? })` resolves with the report of an
update run inside the screen, or `null` (declined, refused while a scan of the session runs, or
run outside). The foundation's
`outsideLauncher` confirms (when `confirmBeforeUpdate`), then ends the session with
`{ kind: "outside", run, returnTo }`; `MenuApp` runs it on the plain terminal, waits for Entrée,
then either drops the updated packages (`withoutUpdated`) and reopens on `returnTo` (default
Paquets), or rescans (`rescanAfterUpdate`). An in-screen launcher gets a `LauncherContext`
(`takeOver`, `exit`, `afterUpdate(report, returnTo)`, `isScanning()`, …) and falls back by
delegating to `outsideLauncher`. Both launchers start nothing while `isScanning()` (package
managers are busy with the scan); their callers say why first — Paquets' notice, Planification's
run-now.

`UiPreferences` (`launchView`, `scanOnLaunch`, `confirmBeforeUpdate`, `rescanAfterUpdate`,
`packageSort`, `noteColumn`, `animations`, `notifyOnDone`, `showIncompatibleProviders`, `scan`)
come from `uiPreferences()`; the session redraws when they or the appearance change, and the
spinners stand still when `animations` is off.

Paquets: `PackagesPanel({ onLaunch, onRescan? }, { actions, markers, noteColumn, isScanning })`.
Before its first results it says a scan is running, or — no scan running, as with
`scanOnLaunch` off — how to start one (`r`). A
`PackageAction` (key, hint, empty-selection notice, `run(selection)`) acts on the **checked**
packages only and can never take a key of `RESERVED_PACKAGE_KEYS`. A `PackageMarker` adds a
one-column mark after the checkbox; the column takes no room unless a visible package has a mark.
`PackageList(scans, nameOf, { sort })` reads the order on use (`orderPackages`: provider, name,
bump), so a changed preference re-sorts at once, checks kept.

Labels live in `src/ui/text/<feature>-labels.ts` (the menu's own: `menu-labels.ts`), in a
domain sub-folder once a domain has several (`journal/`, `schedule/`, `settings/`), which keeps
`ui/text` under the 10-file budget.

### 3.10 French formatting (`src/ui/text/fr-format.ts`)

`formatCount`, `formatDecimal`, `formatPercent`, `formatDuration`, `formatClock`, `formatDate`,
`formatDateTime`, `formatRelative(date, now)`: always `fr-FR`, narrow and non-breaking spaces
turned into plain ones (a string's length is its width), `now` always injected, local time.

### 3.11 Test support (`tests/support/tui/`)

`test-host.ts`: `createTestHost({ size, createAppearance })`, a screen host on OpenTUI's
in-memory renderer configured like the real one (no OpenTUI Ctrl+C or signal handling), plus
`press` and `frame`. `menu-driver.ts`: `bootMenu({ scans, size, controller, views, providers,
scanOnStart, initialView, state, createAppearance, launcher, preferences })` →
`{ screen, controller, state, exit, press, frame, waitForText, setPreferences }`; it installs the
launcher and preference slots for the current test only, and ends the session when the test is
over (the host then releases the screen as on a quit), so no renderer outlives its test.
A suite that mounts screens with `createTestHost` itself ends them the same way. `defaultViews()`,
`scriptedController()` and `EMPTY_REPORT` are exported for suites that assemble their own menu.

---

## 4. Extension cookbook

| Need | Do | Never |
|---|---|---|
| A new menu view | `src/ui/views/<id>-view.ts` exporting a factory that returns a `ViewDefinition`; one line in `src/commands/menu-views.ts` (sorted); tests through `bootMenu` | edit `menu-session.ts`, `view-registry.ts` or `sidebar.ts` |
| Act on checked packages from another view | `ViewDefinition.packageActions` / `packageMarkers` | edit the packages panel |
| A full-body screen (run view) | `context.takeOver` / `LauncherContext.takeOver` | toggle boxes by hand |
| Commands, global options, startup wiring | a `CliModule`, one line in `CLI_MODULES` (sorted by id) | edit `cli.ts` |
| Install a process-wide behaviour (launcher, appearance, preferences, log backend, tracer, batch guard, update observer) | the slot setter, from `CliModule.beforeAction` only; reset in tests | set slots from views, panels or library code |
| Run installs elsewhere than the terminal | `routeInheritTo(sink)` around the work, restore in `finally` | spawn installers yourself; call `IPty.kill()` |
| Update packages | `runUpdates(requestsFrom(selection, { scheduleId }), ports)` | call `provider.update()` directly (the elevated child excepted) |
| Persist settings | `defineSection` + `configStore().read/write/update`; machine-local data in its own `ConfigStore({ file })` | read config in `__admin-batch` |
| Paint | `Tone` + `Fill`; glyphs from `glyphs.ts` | build an `RGBA` outside `src/ui/theme/**` |
| Log | `log.info("domain.action", data)` | `console.*`, direct stderr |
| Strings | French constants in `src/ui/text/[<domain>/]<feature>-labels.ts`; numbers and dates through `fr-format.ts` | NBSP/NNBSP in TUI strings; `toLocaleString()` without `fr-FR` |
| Docs | a design note in `docs/development/design/`, your guide page, a changelog fragment | edit shared docs in wave 2 |

Contracts are extended **additively** only (new optional members), announced in the extending
branch's design note.

---

## 5. Superseded spec symbols

The area specs were written before the foundation. Import these; never redeclare them.

| In the spec | Use | From |
|---|---|---|
| `Density` (themes `interface-section`) | `Density` | `src/ui/theme/appearance.ts` |
| `GlyphMode = "auto" \| "unicode" \| "ascii"` (themes) | `GlyphPreference` (the setting) and `GlyphMode` (resolved) | `src/ui/theme/glyphs.ts` |
| `ui.charts`, `ChartsPreference`, `resolveGlyphs()` (observability) | `interface.glyphs` → `resolveGlyphMode()`; charts derive their sets from `GlyphMode` | `src/ui/theme/glyphs.ts` |
| `ui/charts/format.ts` (observability) | `fr-format.ts` | `src/ui/text/fr-format.ts` |
| scheduler relative dates | `formatRelative(date, now)` | `src/ui/text/fr-format.ts` |
| `PackageSort`, `NoteColumn` (themes) | same names | `src/ui/app/ui-preferences.ts` |
| `LaunchView` (themes), `ViewId` (old `sidebar.ts`) | `ViewId` | `src/ui/app/view-definition.ts` |
| `INTERFACE_SECTION.defaults` (themes) | derived from `DEFAULT_UI_PREFERENCES`, with an equality test | `src/ui/app/ui-preferences.ts` |
| `class Appearance` (themes) | `class ThemedAppearance implements Appearance` | `src/ui/theme/appearance.ts` |
| `LogContext` (observability) | `OperationContext` | `src/core/state/run-context.ts` |
| `LogLevel` (observability) | `LogLevel` | `src/core/log/log.ts` |
| a second `traceCommand` (debug-log) | `createLogTracer(): CommandTracer`, installed with `setCommandTracer` | `src/core/process/command-tracer.ts` |
| `appStateDir()`, history `paths` roots | `stateDir(kind)`, `configDir()` | `src/core/state/app-dirs.ts` |
| `install-io/` (update-flow) | `core/process/` | — |
| `origin: "scheduled"` (scheduler) | `trigger` + `scheduleId` | `src/core/state/run-context.ts`, history |
| `ApplyOptions.origin` (scheduler) | `ApplyOptions.scheduleId` | `src/core/update/apply-update.ts` |
| `UpdateLock` (scheduler) | `BatchLock`, `createBatchGuard()` | `src/core/update/batch-lock.ts` |
| `PlannedUpdate` / `RunPlan` (scheduler) | `ScheduledTarget` / `TickPlan` (scheduler-owned names) | — |
| `PackagesPanel(onSubmit)`, `{ onSubmit, onSchedule }` | `PackagesPanel({ onLaunch, onRescan? }, options)` + `PackageAction` | `src/ui/panels/packages-panel.ts` |
| `class UpdateLauncher` (update-flow) | `UpdateLauncher` interface + `LauncherFactory` slot | `src/ui/app/update-launcher.ts` |
| `MenuController.providersStatus/updatePackages/updateTargets/validateTargets` | the Providers view's status port; `updateOutside(packages, request?)` | `src/ui/views/providers-view.ts`, `src/ui/app/menu-session.ts` |
| `PANEL_FRAME` | `panelFrame(density)` | `src/ui/tui/text-panel.ts` |
| `tests/ui/tui-test-host.ts`, `createTestHost(width, height)` | `tests/support/tui/test-host.ts`, `createTestHost({ size, createAppearance })` | — |

---

## 6. Installing with npm 11: node-pty's install script

`node-pty` (optional dependency, exact pin 1.1.0, the embedded terminal of in-app updates) ships
an install script. npm 11 reviews install scripts: by default `npm i -g @charles_lindecker/gup`
runs it with a notice that it is not covered by an `allowScripts` policy, and with
`strict-allow-scripts=true` the install fails instead. The supported answers:

- **Allow it:** `npm i -g @charles_lindecker/gup --allow-scripts=node-pty` (the
  `allow-scripts` setting is meant for global installs; it matches the resolved package).
- **Skip it:** `--ignore-scripts` is harmless on Windows and macOS: node-pty ships prebuilt
  binaries there, and gup makes the macOS `spawn-helper` executable at runtime (in-app updates
  branch). On Linux without a prebuild, in-app updates are then unavailable and gup falls back to
  updating outside the screen.

The installation guide and the release notes repeat this (wave 3, `docs/feature-guides`).

---

## 7. Security notes

- The elevated `__admin-batch` child runs only opted-in modules and never reads the settings
  file; its install timeout and log threshold come from the parent's payload (bounded, validated).
- Every spawn goes through `runner.ts` (`execa` has no other importer; argv sanitisers unchanged);
  `launchDetached()` takes no shell. No `shell: true` literal outside the scoop allowlist.
- Settings are parsed leniently from own keys only; prototype-polluting names are dropped; a
  corrupt file is moved aside, never deleted; writes are atomic (`wx` 0600 temp file, rename).
- Nothing is written to the terminal while a screen is mounted (output router); a signal
  restores the terminal before the process exits.

## 8. Cross-platform notes

- Every platform decision is a function of injected facts (`platform`, `env`, `DirContext`),
  tested on Windows for macOS and Linux: platform sets, state and config dirs, path flavours,
  glyph mode, signal set (SIGBREAK on Windows only, SIGINT on POSIX only).
- The batch lock is a named pipe on Windows and a unix socket on POSIX (path ≤ 103 bytes, else
  `$XDG_RUNTIME_DIR` or the temp dir). POSIX-only behaviour (stale-socket takeover, file modes)
  is tested on the POSIX CI legs only.
- conhost 10.0.26100's teardown constraint (`teardown.ts`) is untouched; the appearance is
  settled before the renderer is destroyed.

## 9. Deviations from the integrated plan

Recorded so the integration agent and the wave-2 branches are not surprised.

- **Commit order:** "drop Tout mettre à jour / Cible…" landed before the view registry: the
  registry has no place for actions, so dropping them first avoided throwaway code. The signal
  fix (F-1) is its own commit after the appearance seam.
- **`ViewContext.onScanCompleted` is `onScansChanged`:** it also fires when an update pruned the
  results and when a session starts on previous results without scanning — the packages view
  needs all three. `observeScan(observer)` (progress) is an addition; `ScanObserver` lives in
  `ui/panels/scan-panel.ts`, the scan fan-out (`ScanBus`) in `ui/scan-progress.ts`.
- **`SessionExit.run` returns the `UpdateReport`** and carries `returnTo`, so the app can prune
  after an outside update; **`MenuController.updateOutside(packages, request?)`** takes two
  arguments (no `state`): pruning belongs to the app and the session.
- **`LauncherContext.afterUpdate(report, returnTo?)`** gains the optional `returnTo`.
- **`PackagesHandlers.onRescan` is optional:** the `gup update` picker has no rescan and shows no
  `r` hint. `r` is wired in the foundation because pruning replaced the forced rescan.
- **`PackageListOptions.sort` is a function** (`() => PackageSort`), read on use, so the
  preference applies live without losing checks.
- **`configureScreens(null)`** restores the defaults (the slot-reset convention).
- **`MenuApp(deps, terminal)`:** the second argument is `{ host, pause }`, so tests drive the
  outside loop without a real terminal.
- **`resolveGlyphMode`** uses the effective POSIX locale (`LC_ALL`, then `LC_CTYPE`, then `LANG`)
  rather than "none of them contains UTF-8".
- **Glyph map:** covers the symbols of the eight specs that can reach a terminal; website-only
  characters (Arabic, CJK and Bengali punctuation, emoji) are left out.
- **F-13's "unix socket under the scheduler state dir"** (since `fix/wave-2-polish`): the lock
  has a state dir of its own, `<state root>/gup/locks`, on every OS; it stays in the scheduler's
  directory only when `GUP_SCHEDULER_DIR` is set. Every interactive update took the lock, and so
  recreated an empty scheduler folder after the user purged it.
- **Earlier parts** (see their commit bodies): the batch lock lives in `core/update/batch-lock.ts`
  (folder full at 10 files); `core/state/file-lock.ts` serves the config store; an unknown or
  foreign provider in a request is reported *skipped*; `OutcomeEntry.key` and
  `UpdateDecisions.declinedElevation` are additive members; `launchDetached` reads a missing
  binary as launched on Windows (cmd.exe routing), so its integration assertion runs on POSIX.
- **`UpdateDecisions.unattended`** (additive) is how `HEADLESS_DECISIONS` sets
  `UpdateOptions.unattended` (F-5): decisions are the one port a scheduled run already swaps, so
  no caller has to remember a second flag.
- **`ViewContext.isScanning()`** and **`PackagesOptions.isScanning`** (additive): with
  `scanOnLaunch` off, Paquets must tell "no scan yet — `r`" from "scan running"; a session that
  starts with neither a scan nor previous results no longer announces empty results.
- **`menu-session.ts` split:** the keyboard focus and sidebar cursor moved to `menu-nav.ts`
  (the slot F-10 kept in `ui/app`), bringing the session back under the 300-line alert.

## 10. Folder budget after the foundation

`core/platform` 7 · `core/state` 3 · `core/process` 5 · `core/log` 1 · `core/config` 6 ·
`core/update` 10 (full) · `ui` root 6 · `ui/app` 9 · `ui/views` 4 · `ui/panels` 7 · `ui/theme` 3 ·
`ui/text` 2 · `ui/tui` 9 · `commands` 7 + `cli/` 3. `ui/app` keeps one slot, for the in-screen
launcher (`menu-nav.ts` took the one F-10 kept for splitting the session); labels modules go to
`ui/text/`; the options host and schedule flows go to their panel folders
(`ui/panels/options/`, `ui/panels/schedules/`).

Shared documents that still describe the 0.4.0 internals (`architecture.md`, `how-gup-works.md`:
`ui/retry-failed.ts`, `maybeRetryFailures`, the menu's own update loop) are rewritten by the
wave-3 consolidation, from this note.
