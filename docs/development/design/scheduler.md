# Design note — scheduled updates (`feat/scheduled-updates`)

Status: **part 1 of 2 shipped — core and command line.** Part 2 (same branch)
adds the menu: the Planification view, the `p` package action, the `◷`
marker, the editor and run-now in the run view. Sources: the scheduler spec,
the integrated plan §6.8 and amendments S-1…S-5, F-5, F-13, F-15, W2-4, W2-7.
The user guide is [`../../guide/scheduled-updates.md`](../../guide/scheduled-updates.md).

A **schedule** is an explicit list of `provider:packageId` targets plus a
recurrence; it can never designate a whole provider. Execution is OS-native
and non-resident: while at least one schedule is enabled, one per-user OS
trigger starts `gup __schedule-tick` every 15 minutes; the tick decides what
is due, does the work through the shared update pipeline, records it, exits.

---

## 1. Windows spike (step 0), recorded

Windows 11 Pro 10.0.26200.9550, standard user, Node 26.10.0, throw-away tasks
named `gup-it-<random>`, each deleted and verified absent
(`Get-ScheduledTask -TaskName 'gup-*'` empty afterwards).

| Question | Finding |
|---|---|
| SID | `whoami /user /fo csv /nh` → `"host\user","S-1-5-21-…"`: non-localised CSV, parsed with `"(S-1-[0-9-]+)"` |
| Registration | `schtasks /Create /TN <name> /XML <file> /F` accepts a UTF-16LE file with BOM, in the root folder, as a standard user, with a SID `<UserId>`, `InteractiveToken`, `LeastPrivilege` |
| `conhost --headless` | node runs; `stdin.isTTY` and `stdout.isTTY` are **true**; the parent conhost has `MainWindowHandle = 0` (no window); node's exit code 7 shows as `LastTaskResult = 0` (not propagated) |
| Process context | working directory `C:\WINDOWS\system32`; the user's registry environment (`PATH`, `LOCALAPPDATA`) |
| `IgnoreNew` | a second `/Run` while the first instance runs answers "est en cours d'exécution" and starts nothing |
| `direct` launcher | the XML with node.exe as `<Command>` registers (not run: it would flash a window on the user's desktop) |
| Output | localised (French, OEM code page): only exit codes are interpreted; `/Query` of a missing task exits 1 |
| `/Query /XML` | returns the *normalised* definition: values equal to their default are dropped (`RunLevel LeastPrivilege`, `Priority 7`, `StopAtDurationEnd false`), a `<URI>` is added |

Consequences in the code: the tick sets `GUP_NONINTERACTIVE=1` (TTYs lie),
changes to the scheduler state dir (no System32 cwd), and never relies on its
exit code; status = exit code of `/Query`; the integration test asserts on
the normalised XML.

## 2. Layout

```
src/core/scheduler/                    5 files + 4 folders
  scheduler-timing.ts   the time budget (one place: the values only make sense together)
  target-resolver.ts    targeted scan → planTick; requestsOf(plan)
  scheduled-run.ts      ScheduledRun.tick() / stop()
  manual-run.ts         ManualRun.run(schedule, execute) — CLI and menu run-now
  run-summary.ts        report → per-schedule ScheduleRunRecord + RunStatus
  model/       (7)      types, schedule-target, recurrence, cron (only croner importer),
                        validate-schedule, due, tick-plan — all pure
  persistence/ (5)      scheduler-files, schedules-section, schedule-repo, run-state, install-record
  artifacts/   (4)      windows-task-xml, launchd-plist, crontab-block, xml-text — pure builders
  trigger/     (9)      os-trigger (types), trigger-factory, task-command, captured-env,
                        windows-task, launchd-agent, crontab-trigger, trigger-sync, trigger-health
src/commands/schedule/ (9)            schedule-module, scheduler-services, schedule-args,
                                      crud-commands, report-commands, trigger-commands,
                                      run-now, run-deps, tick — one slot left (part 2's controller)
src/ui/text/schedule-labels.ts        vocabulary shared with the menu
src/ui/text/schedule-cli-labels.ts    what `gup schedule` prints
```

Names follow the plan (C26): `ScheduledTarget` / `TickPlan`, never the
pipeline's `PlannedUpdate` / `UpdatePlan`.

## 3. Model

- **Targets.** `parseTarget("winget:Git.Git")`; a bare provider, an empty id,
  `*`/`?`, a leading `-`, control characters or more than 256 characters are
  refused. The stored id only *selects* a scan row; the id handed to
  `update()` is the scan's (`planTick`).
- **Recurrence.** `daily | weekly | monthly (1–28 | "last") | cron`, all
  evaluated as a 5-field cron by `CronExpression` (croner 10.0.1, exact pin,
  `mode: "5-part"`, OR semantics for dom/dow, local time zone, DST-safe).
  croner's `previousRuns` throws on never-matching patterns (`0 9 31 2 *`):
  every call is guarded. Errors are translated ("valeur invalide pour les
  minutes : 60").
- **Validation** (`validateDraft`): name 1–60, ≤ 50 targets, ≤ 50 schedules,
  no duplicate, provider known and supported here (`lookupProvider`
  messages), `canUpdateUnattended`, fires within a year, **at most hourly**
  (smallest gap over the next 24 occurrences).
- **Due** (`evaluateDue`): anchor = `min(now, max(armedAt, lastAttemptAt))`;
  the first occurrence after it decides; the latest passed occurrence runs
  once — on time within 30 minutes, else catch-up (or *missed* without
  catch-up). Consuming sets the anchor to now: any number of missed windows
  collapse into one run; a clock set backwards cannot freeze a schedule;
  creating, re-timing or re-enabling re-arms.

## 4. Runs

**Tick** (`ScheduledRun.tick`): nothing enabled → idle, no write. Heartbeat
(`lastTickAt`). Batch: `BatchLock.tryAcquire(location, "scheduled")` — the
foundation's OS-released lock (F-13, S-2), never waited for: busy → nothing
consumed. Missed occurrences recorded. Due ones consumed **before any work**
(crash safety), then `TargetResolver`: detect and scan only the needed
providers (`detectAvailableProviders(candidates)` + `scanAll({ detected,
only })`, recorded in the history with trigger `schedule`), `planTick`.
Every installed provider failing to scan → the occurrence is given back
(anchor restored, `deferrals + 1`) up to `MAX_DEFERRALS` (4), then reported
failed. Otherwise the plan runs through `runUpdates` with `HEADLESS_DECISIONS`
(never elevate, never retry, `unattended` → winget `--disable-interactivity`,
F-5) and `batch: "scheduled"`, inside a pipe sink (stdin ignored, installer
output line by line to the log, 256 KiB per stream), under a gate that closes
at the run deadline (120 min) or on `stop()`. Results are summarised per
schedule, deferrals cleared, orphan states pruned; targets skipped before
install go to the history once (with a schedule id) and to the log.

**Time budget (S-1).** The tick clamps the install timeout:
`setting === 0 ? DEFAULT : clamp(setting, 60, 1800)`. A unit test pins
`MAX_RUN_MINUTES + cap < TICK_WATCHDOG_MINUTES (170) < EXECUTION_TIME_LIMIT (180)`.

**Headless entry** (`commands/schedule/tick.ts`): `GUP_NONINTERACTIVE=1`,
`chalk.level = 0`, boot grace (300 s), scheduler dir created and made the
working directory, captured environment applied (POSIX), launchd stderr
trimmed past 1 MiB (macOS), clamped timeout, SIGTERM/SIGINT/SIGHUP (+SIGBREAK
on Windows) → `stop()` with a 30 s grace, watchdog. Never used: scan
progress UI, skip session, retry prompts, elevation, anything under `ui/tui`.

**Run now** (`ManualRun`): same resolver and plan; the updates run where the
user watches — on the CLI `updateOnConsole(requests, { yes: true })`, which
enters the interactive batch guard (waits, with a message, for a running
tick) — and the record becomes the last run (`kind: "manual"`); the anchor is
untouched. A state file that cannot be written costs a log line, not the run.

## 5. Persistence (machine-local, `stateDir("scheduler")`)

| File | Writer | Notes |
|---|---|---|
| `schedules.json` | interactive commands | `ConfigStore({ file, maxBytes: 4 MiB })`, section `scheduler` v1 (C3); re-read under the file lock before every change; a malformed schedule is dropped whole; a missing `enabled` reads as disabled |
| `state.json` | runs | `RunStateStore`: atomic write inside `withFileLock`; corrupt → empty (logged) |
| `install.json` | `TriggerSync` | argv, launcher, captured env, date, gup version |
| `agent-stderr.log` | launchd | macOS only |

`purgeSchedulerFiles` removes them (and their `.lock` files), then the
directory only if empty (a `GUP_SCHEDULER_DIR` may point at a shared folder).

## 6. OS triggers

| | Windows | macOS | Linux |
|---|---|---|---|
| Adapter | `WindowsTaskTrigger` | `LaunchdTrigger` | `CrontabTrigger` |
| Artefact | task `gup-scheduler-<SID>`, XML (UTF-16LE+BOM) in a `mkdtemp` dir, `wx`, removed | `~/Library/LaunchAgents/io.github.lindecker-charles.gup.scheduler.plist`, atomic, owner-only | managed block in the user crontab |
| Install | `schtasks /Create /XML /F` | write, `bootout` (ignored), `bootstrap gui/<uid>`, `enable` | `crontab -l` (LC_ALL=C) → upsert → `crontab -` on stdin |
| Status | `/Query` exit code | `print` exit code + `print-disabled` parse | block present |
| Binaries | `%SystemRoot%\System32\{schtasks,whoami,conhost}.exe` (SystemRoot validated) | `/bin/launchctl` | `crontab` resolved once, then absolute |

`resolveTaskCommand` registers realpath'd node and gup entry (package name
checked) and refuses npx caches, temp dirs, `.ts` sources, root, WSL, and
paths the format would re-interpret. `captureEnv` snapshots an allowlist
(never credentials; `GUP_*` except `GUP_NONINTERACTIVE`/`GUP_SCHEDULER_DIR`).

**TriggerSync**: `reconcile` (after a change: install the first time, repair,
remove at zero enabled), `heal` (at start: never a first registration),
`reinstall`, `remove`; all failures become `{ kind: "failed", reason }`.
**S-3**: a recorded registration whose node or entry no longer exists, or
belongs to the same package root, is re-registered; one from **another
existing installation** is reported `foreign` and kept — by `heal` and by
`reconcile` alike — until `gup schedule install` moves it.

**Health** (`assessTrigger`): none / not-installed / disabled-by-user /
foreign / outdated / stale (no heartbeat for 45 min while up for 45 min,
measured from the install when no tick ever ran) / active — one verdict for
`list`, `status`, `doctor` and the menu (`triggerLine(health, { repair })`).

## 7. Command line (`scheduleModule`)

`gup schedule add|list|status|remove|enable|disable|run-now|install|uninstall`
(+ `--json` on `list`/`status`), hidden `__schedule-tick`. Exit codes: 0, 1
(trigger not changed / run failures — schedules always saved first), 2
(invalid arguments, nothing changed). The module:

- `triggerFor("__schedule-tick") = "schedule"` (F-15), so the journal module
  sees scheduled runs;
- `beforeAction`: installs `createBatchGuard(location)` for every command but
  the tick (interactive runs wait for a scheduled batch); heals the trigger
  before `schedule list|status|run-now` (printing a repair notice) and, in
  the background and silently, when the menu starts;
- `diagnostics()`: one "Planification" line for `gup doctor` (W2-7).

Commands take `SchedulerServices` (stores, trigger, sync, registry facts,
scanner, clock) and a `CommandOutput`, so tests run them on sandboxed stores
with an in-memory trigger; nothing in a unit test registers a real trigger or
scans the machine (W2-4).

## 8. Security

- No shell anywhere; argv vectors through `core/runner.ts`; `crontab -` on stdin.
- System binaries by absolute path; `%SystemRoot%` accepted only as a plain
  drive path; `crontab` resolved once.
- Least privilege: Windows `InteractiveToken` + `LeastPrivilege`, no stored
  password; `gui/<uid>` agent; user crontab; root/sudo refused.
- Registered command line: realpath'd and identity-checked; XML/plist text
  escaped; `"`/`%` refused for Task Scheduler, `'`/`%` for cron, control
  characters everywhere (`tests/security/scheduler-injection.test.ts`).
- Config is data: a tampered `schedules.json` can only select among rows the
  provider itself reports outdated; option-like ids are dropped at load.
- Never provider-wide, enforced at the model (parse/validate) and at execution
  (`aggregate` rows, admin-only providers); the menu gesture is part 2.
- Never elevated, never forced, never prompting.
- Files: owner-only modes (temp-then-rename 0600), XML in a private `mkdtemp`
  dir; env captured from an allowlist; child output capped per install.

## 9. Testing

Pure builders and parsers are tested for every platform on any platform
(`path.win32`/`path.posix` chosen from the context). Adapters run against a
scripted runner (exact argv, unreadable crontab never overwritten, status
mapping). Behavioural tables cover due evaluation, planning, summaries and
validation; `ScheduledRun` is tested with fakes (idle, busy, consume-before-
work, deferrals, deadline, stop, orphan pruning, skipped history).

**Real system, opt-in (`GUP_MUTATE=1`, Windows):**
`tests/integration/scheduler-windows.test.ts` registers a uniquely named
`gup-it-<random>` task running a probe script (never gup, never the user's
schedules), reads the normalised XML back, runs it headless, checks the probe
saw `__schedule-tick` and TTYs, deletes it and verifies it is gone; `afterAll`
deletes it whatever happened. Green on this machine.

## 10. Foundation contracts extended (additive) and touch points

- `FieldReader` gains `text(key, bounds)`, `objects(key, max)` and
  `kindOf(key)` (`src/core/config/field-reader.ts`): sections that hold
  records — a list of schedules, each with a list of targets and a
  `day: number | "last"` field — need them. New test file
  `tests/core/config/field-reader-records.test.ts`.
- `ConfigStoreOptions.maxBytes?` (default: the 256 KiB settings bound) and
  `readConfigFile(file, maxBytes?)`: at its documented limits the schedules
  file reaches ~1.5 MiB, and the settings bound would move it aside as
  corrupt. New test file `tests/core/config/store-size.test.ts`.
- `src/commands/cli/cli-modules.ts`: one line, `scheduleModule`.
- `tests/commands/cli/cli-modules.test.ts`: the pinned command list gains
  `schedule` and the hidden `__schedule-tick` (every branch adding a command
  edits these adjacent lines).
- `eslint.config.security.js`: a justified `detect-non-literal-fs-filename`
  override for `trigger/task-command.ts` (realpath of the running node and gup,
  their package.json, the temp dir).

## 11. Deviations from the spec and the plan

| # | Deviation | Why |
|---|---|---|
| D1 | No `LOCK_STALE_MINUTES`; S-1's inequality uses the tick watchdog | F-13's lock is OS-released and never broken by age |
| D2 | The heartbeat is written before taking the batch | a long interactive update must not make a working trigger look stale |
| D3 | `ScheduleRepo.enable/disable` instead of `setEnabled(ids, flag)`; no `replace`/`markSeen` yet | no flag parameters; no caller before part 2 (the editor, the unseen-runs banner) |
| D4 | `SyncResult` gains `foreign`; `reconcile` keeps a foreign registration too | S-3 applied consistently: two installations never take the trigger from each other implicitly |
| D5 | Environment drift alone does not re-register | the POSIX env lives in install.json and is applied by the tick; re-registering on every start from a shell with another `PATH` would re-announce the macOS background item |
| D6 | Plist written owner-only (atomic write) instead of 0644 | launchd refuses group/world-writable plists only; owner-only is stricter |
| D7 | The tick changes to the scheduler dir; no `<WorkingDirectory>` in the XML | Task Scheduler starts in System32 (spike); one rule for every OS |
| D8 | `$`, backticks, `"` and `&` allowed in crontab paths | inert inside single quotes; the security test proves they stay in their word |
| D9 | `gup schedule status` added; `list --json` has `trigger.health`; no `notify` | task scope; S-4 |
| D10 | Run-now on the CLI uses console ports with `-y` semantics | no retry question with destructive flags, as for scheduled runs; the user still sees installers |
| D11 | A package listed by several due schedules is installed once; its history attempt carries the first schedule id; skipped targets are recorded once per run | one install per package; `UpdateRequest.scheduleId` is single |
| D12 | XML namespace and plist DTD identifiers in single-quoted constants | the shared `http-targets` drift test flags double-quoted `http://` literals; these are identifiers, never fetched |
| D13 | `GUP_SCHEDULER_DIR` is not captured; `add`/`install` warn when it is set | the directory must be known before `install.json` is read |
| D14 | The opt-in Linux crontab integration test is not written | it cannot run here; the pure block and the adapter's argv are unit-tested |
| D15 | Cron nicknames (`@daily`) accepted | croner accepts them in 5-part mode; validation still applies |

## 12. Hand-off to part 2 (menu)

Ready to consume: `SchedulerServices` / `schedulerServices()` (one per
process), `readTriggerReport(services)` + `triggerLine(health, { repair: "i" })`
for the status line, `ManualRun.run(schedule, (requests) => launch(...))` for
S-5 (the launcher returns the report, `null` when declined), `validateDraft`
for live editor validation, `upcomingRuns` for previews, `recurrenceLabel`,
`runStatusLabel`, `targetResultLabel`, `STATUS_GLYPHS.scheduled` for the
marker, `NEVER_A_PROVIDER` for the gesture's notice, `ScheduleTarget.label`
for display names captured from the scan. `commands/schedule/` has one slot
left (the controller); labels go to `src/ui/text/`, the panel and flows to
`src/ui/panels/schedules/`, the view to `src/ui/views/schedules-view.ts`.
