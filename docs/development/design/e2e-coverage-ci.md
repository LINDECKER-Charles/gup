# Design note — test consolidation, platform simulation and coverage floors (`test/e2e-coverage-ci`, part 1)

Status: part 1 of 2 on `test/e2e-coverage-ci` (wave 3). It finishes the test strategy over the
suites the earlier branches left in place: one home per behaviour, security rules gathered where
the security workflow runs them, every view of the menu held to WCAG, every provider replayed on
every OS it supports, and coverage floors on the modules where a gap can do harm. Part 2 adds the
real-machine E2E toolkit and suites, the CI and E2E workflows and the testing guides.

Sources: testing spec S10, S12, S14, §5.10, §10; integrated plan §7 (the `test/e2e-coverage-ci`
row), §9, §11.3; amendments IT-6, X-3. Read with [`test-harness.md`](test-harness.md) (the
projects, the fake machine) and [`provider-contracts.md`](provider-contracts.md) (the contract
cases this branch replays).

---

## 1. Consolidation (S10)

Every deleted or merged test is mapped in the body of the commit that removes it: to the test that
now holds its behaviour, or "dropped" with one of the allowed reasons (a duplicate, a mock's call
shape that a behaviour test covers, unshipped code). Each rewrite was checked with seeded
mutations, listed in the same commit bodies.

| Before | After |
|---|---|
| `core/install-source`, `-extra`, `-macos` (three files, two `setPlatform` copies) | one table-driven `core/install-source.test.ts` at the process and `realpath` boundaries; the path classifier stays pinned once, in `security/install-source` |
| `core/registry`, `-extra`, `-log` (the last mocking gup's ownership filter) | one `core/registry.test.ts`; the ownership exclusion runs the real filter over a faked `where` |
| `core/history-paths`, `history-store` at the root of `tests/core` | `core/history/{paths,store}.test.ts`; `paths` keeps what `historyLocation` adds to `stateDir`, whose roots `state/app-dirs` pins |
| argv hardening in `security/command-injection` (3 payloads) and `integration/runner-spawn` (15) | `security/command-injection`: the 15 payloads through `run()` and through the embedded terminal's trampoline (§2) |
| `core/update/retry-consent` | `security/retry-consent`, so `npm run test:security` runs it |
| `ui/select` (a mocked picker) | `ui/prompts/package-picker`: `promptPackageSelection` opens the real picker on the test host |
| `commands/list` (registry, scan screen and table mocked, options checked on the mocks) | the real command over registered providers whose probe and scan are stubbed: stdout, stderr and the history record it writes |
| `renderScanTable` only ever mocked (gap F5) | `ui/table.test.ts`: rows, order, error rows, totals |
| `gup doctor`'s fail-soft detection (F6) tested layer by layer | `commands/doctor-fail-soft.test.ts`: the real command over a throwing and a wedged registered probe |
| 15 suites with their own `process.platform` switch | `tests/support/platform.ts` everywhere |

**Mock call shapes.** A script (kept out of the repository) flagged every test of `tests/{core,
commands,ui,security}` whose assertions were all on mocks: about eighty. A call assertion stays
when the mock *is* the boundary — the argv a process receives, the UAC batch, a PTY kill, a
terminal notification, a log backend, a port a component hands its decisions to: that is what the
code does to the outside world. It goes when it only proves that gup's own helper was called:
the list forwarding tests, `select`'s name mapping, corepack's "both probes in parallel" (which
counted calls and proved no parallelism). `commands/update.test.ts` and `ui/scan-progress.test.ts`
keep their module mocks for now (the spec's verdict is "keep"); their forwarding assertions are
the next candidates.

## 2. The security suite

`tests/security` now gathers, beside the source scans and pins it already had:

- **argv hardening on both spawn paths** — shell metacharacters and variable syntax as literal
  argv entries through `run()`, and through `runInherit` routed to the embedded terminal (a real
  ConPTY/PTY, the tsup-built trampoline). The child writes its argv to a file, so terminal
  wrapping cannot blur the comparison. Skipped only where node-pty is not built (Linux without a
  toolchain).
- **retry consent** (gap F5).
- **package-id allowlists** — every place an id, a font family, a release slug or a path is
  spliced into something another program parses: scoop's charset before its shell, NpackdCL's
  option parser, R code, the Nerd Fonts family, PowerShell literals (PSResourceGet, PowerShell
  modules, the Podman and Rancher Desktop exe paths, the user's font path), GitHub slugs before a
  URL. Most validators are private, so the suite drives the providers on the fake machine: vitest
  routes `tests/security/providers/**` to the `providers` project, and the membership self-test
  pins the route. `npm run test:security` (and the security workflow) runs both projects' files.

## 3. The contrast audit, every view

The audit's machinery is `tests/support/tui/contrast-audit.ts`: the audited rows (every RGB theme
on an unknown terminal; `auto`, `terminal` and `monochrome` on Campbell and Terminal.app Basic;
AAA at 256 colours), `auditMenu()` (the menu booted under the theme engine, frames captured by
state), and the measure (the independent WCAG oracle: 4.5:1 text, 7:1 at AAA, 3:1 borders).
Three suites share it and run in parallel:

| Suite | Walk |
|---|---|
| `contrast-audit` | Paquets (rows, checks, filter, confirmation), Scan with a failure, Providers, Options with every dialog, the JOURNAL rows (the level overridden by the environment, its hint in the warning tone), the colour editor with an unreadable accent |
| `contrast-audit-views` | the Journal's four tabs, the export dialog, the report-opened and failed-export notices; Planification with an enabled, a disabled and a failed schedule, the editor and its warning note, the trigger consent, the run-now notice |
| `contrast-audit-run` | an in-menu update: confirmation, a package installing, typing mode, the stop dialog, the UAC step and its refusal notice, the results with a failure, the HTML report's notice |

Each suite also proves it can fail: the legacy look on a white terminal must produce violations.

**The embedded terminal (IT-6).** The run view's pane is not drawn in the theme's colours, so the
theme says nothing about it: the audit takes the pane's texts out of the theme's measure and holds
them to the IT-6 rule instead — they sit on the terminal's own background, never a painted one,
and are readable there whenever the audited terminal's colours are known. A pane made opaque fails
18 of the 19 run tests.

## 4. Platform simulation (S12)

`tests/platform/platform-simulation.test.ts` (providers project) runs on every CI leg, so a darwin
or linux behaviour runs on the Windows box and a win32 one on the Mac leg:

- **Every contract case on the other OSes its provider supports.** The cases are found on disk
  (`contract-cases.ts`: each exported case list of each `tests/providers/<domain>/*.cases.ts`), so
  a new domain or case file joins without an edit. The machine is rebased (`rebase-machine.ts`:
  the home swapped, separators and drive letters converted, Windows executable extensions dropped;
  paths embedded in a longer argument are left alone) and loaded in explore mode: whatever nobody
  scripted fails, as it would on a real machine.
- **Every registered provider, on each OS it supports, where every probe answers** (a permissive
  machine), each instance built once the OS is simulated (its install hint is picked at
  construction).
- **Contract coverage:** every registered provider has a contract case.

Nothing may reject — `isAvailable`, `listOutdated`, `update`, `updateAll` — and rows and outcomes
keep the contract invariants, with each case's waivers (an update of an id no scan listed only has
to resolve: a single-tool provider answers for its own id). The rows may differ from the case's:
a provider on another OS looks elsewhere. 993 tests; 573 of the 595 replays detect their provider
on the target OS and 385 list rows there, so the parsers do run. A Linux-only throw seeded in the
JetBrains root lookup — a path no case covered — fails 6 of them.

What the simulation cannot show (real `which`, exec bits, symlinks, a real PTY, Terminal.app)
belongs to the macOS CI leg, the E2E workflow (part 2) and the Mac session's checklist (plan
§11.3).

## 5. Coverage floors (S14)

No global threshold any more: coverage is a flashlight, and `src/ui/**` and `menu.ts` are
reported again. `tests/support/coverage-floors.ts` lists the floors of the modules where an
untested branch can do harm — the runner and the PATH lookup, the trampoline payload,
install-source and ownership, elevation and the admin batch, the update pipeline, the config
store, the scheduler's model, triggers and artifact builders, log redaction and data sanitising,
the history, the HTML report's escaping and CSP — each with its measure (Windows 11, Node 26.10,
unit + providers + integration). A floor sits a few points under its measure: some branches only
run on another OS, and CI measures on Linux. Ratchet only: lowering a floor needs its reason in
the commit body. A self-test fails a floor whose glob no longer names a source file (vitest would
say nothing). `check.cmd` runs the typecheck beside security, tests and coverage; its coverage job
fails only on the floors.

Measured with the floors in place: all files 92.38 % branches, 97.54 % lines (UI included).

## 6. Deviations from the testing spec

| # | Spec | Shipped | Why |
|---|---|---|---|
| D1 | `support/tui/frames.ts`: `expectFrameGolden`, `assertFitsWidth` | Not added | The screenshot pipeline (`npm run screenshots:check`) already pins every scene byte for byte; a second golden set would churn on every copy change. The view suites check their own widths (`expectFits`). |
| D2 | `package-id-allowlists` in the unit project | `tests/security/providers/**`, routed to the providers project | The validators are private: only a provider on the fake machine shows the refusal or the escape. |
| D3 | `core/install-source.test.ts` | Stays in the unit project, faking the runner and `realpath` | The fake machine answers `where`/`which` from `bin` itself; the detection table needs multi-line answers, empty successes and rejecting probes. |
| D4 | `history-paths` kept | Slimmed to three tests | `core/state/app-dirs` (scheduler branch) now owns the roots it re-tested. |
| D5 | Platform simulation: each case under each supported platform | Each case under each *other* supported platform | The case's own platform is its domain contract's run. |
| D6 | Floors on five modules (with "added by their areas when they land") | Sixteen globs | The areas that landed in waves 2 and 3 (pipeline, config, scheduler, redaction, report) are the ones the spec deferred to them. |
| D7 | `commands/update.test.ts` reworked when in-TUI updates land | Kept with its module mocks | Out of this part's reach; its forwarding assertions are listed in §1 as the next candidates. |

## 7. Findings in `src` (not fixed here: the run view belongs to `feat/in-tui-updates`)

- **Installer output is white on a light terminal.** The embedded terminal paints text in the
  default colour — an installer's output, gup's own notes in the pane — as explicit white, not in
  the terminal's foreground: OpenTUI 0.5.14's `EmbeddedTerminalRenderable` has no
  default-foreground option. On a light terminal (Terminal.app's Basic profile, macOS's default)
  it measures 1.00:1. `contrast-audit-run` keeps every other check of the four affected rows and
  runs their pane check as `it.fails`, so it turns red once the pane follows the terminal's
  foreground. To check by hand in the Mac session (checklist M-03).

## 8. Notes for part 2

- `tests/e2e/**` belongs to the `e2e` project only when `GUP_E2E=1`; its suites reuse
  `tests/support/pty/{trampoline-bundle,recording-pane}` and must not call `.kill(` on a node-pty
  handle (X-3, `security/process-chokepoints`).
- CI coverage on ubuntu should confirm or ratchet the floors from its own measure.
- `docs/development/how-gup-works.md` §16 still describes the suite of 0.4; `testing.md` replaces
  it.
