# Design records

One record per area of the 0.5.0 cycle, written by the branch that built it: what changed for
the user, the architecture, the security and cross-platform notes, the tests, and every
decision or deviation with its reason. They are kept as **records**, in the spirit of
architecture decision records: they say why the code is shaped the way it is, at the time it
was built.

They are not the reference. The current behaviour is described in the guides and in the
reference pages below, which a change keeps up to date; a record is only corrected when it is
wrong about its own time. **Where a record and a reference page disagree, the reference page —
and the code — win.**

| Reference page | What it holds |
|---|---|
| [`architecture.md`](../architecture.md) | Layers, data model, scan, update pipeline, interactive app, process seams, local state, scheduling, settings, composition — with the diagrams |
| [`how-gup-works.md`](../how-gup-works.md) | The end-to-end walkthrough, command by command, and the provider contract in detail |
| [`SECURITY.md`](../../../.github/SECURITY.md#threat-model) | The threat model, its mitigations and the tests that pin them |
| [`testing.md`](../testing.md) | The test strategy, how to run each layer, CI |
| [`docs/guide/`](../../guide/) | What each feature does, for users |

## The records

In the order the branches were merged:

| Record | Area | Reference today |
|---|---|---|
| [`foundation.md`](foundation.md) | The extension points every 0.5.0 feature plugs into: platforms, state directories, install sinks, the log facade, the settings store, the update pipeline and batch lock, CLI modules, the appearance seam, the view registry and launchers; the extension cookbook | [architecture §6, §8, §12](../architecture.md#12-composition-cli-modules-and-slots) |
| [`test-harness.md`](test-harness.md) | Vitest projects, the shared sandbox, the fake machine, the provider contract harness | [testing.md](../testing.md) |
| [`package-multi-select.md`](package-multi-select.md) | Paquets: Entrée updates the checked set only; the selection bar | [interactive-app.md § Paquets](../../guide/interactive-app.md#paquets-pick-what-to-update) |
| [`os-compat.md`](os-compat.md) | Providers foreign to the OS: declarations, the greyed group, the `--provider` warning; §10 the platform gate as the only gate | [architecture §4](../architecture.md#4-providers-and-the-platform-gate) |
| [`options-themes.md`](options-themes.md) | The settings file, ten themes, terminal palette detection, the WCAG contrast enforcement, the Options view | [architecture §11](../architecture.md#11-settings-themes-and-contrast), [themes-and-accessibility.md](../../guide/themes-and-accessibility.md) |
| [`in-tui-updates.md`](in-tui-updates.md) | Updates inside the app: the PTY trampoline, ConPTY release, the exit-file fast path, the run view, the in-screen launcher | [architecture §7, §8](../architecture.md#8-runner-and-process-seams), [interactive-app.md](../../guide/interactive-app.md) |
| [`debug-log.md`](debug-log.md) | The debug log: records, levels, sinks, redaction, the elevated bridge, `gup log` | [architecture §9](../architecture.md#9-local-state-history-debug-log-reports), [journal-and-reports.md](../../guide/journal-and-reports.md#debug-log) |
| [`activity-journal.md`](activity-journal.md) | The strict history reader, the insights, the Journal view, `gup report` text/JSON/CSV | [journal-and-reports.md](../../guide/journal-and-reports.md#activity-journal) |
| [`html-report.md`](html-report.md) | The self-contained HTML report: model, page, CSP, opener | [journal-and-reports.md § HTML report](../../guide/journal-and-reports.md#in-the-browser-the-html-report) |
| [`scheduler.md`](scheduler.md) | Scheduled updates: the Windows Task Scheduler spike, the model, the tick, the OS triggers, the Planification view | [architecture §10](../architecture.md#10-scheduling), [scheduled-updates.md](../../guide/scheduled-updates.md) |
| [`provider-contracts.md`](provider-contracts.md) | The migration of every provider suite to contract cases, recorded fixtures, migration safety | [testing.md](../testing.md) |
| [`screenshot-pipeline.md`](screenshot-pipeline.md) | Generated SVG screenshots: architecture, determinism, privacy; §9 the scenes of every 0.5.0 view | [documentation.md § Screenshots](../documentation.md#screenshots) |
| [`journal-settings.md`](journal-settings.md) | The JOURNAL section of Options, the debug log's level as a setting, `o rapport HTML` on the run results | [configuration.md § Journal](../../guide/configuration.md#journal) |
| [`e2e-coverage-ci.md`](e2e-coverage-ci.md) | Test consolidation, platform simulation, coverage floors, the end-to-end suites, CI | [testing.md](../testing.md) |

## Reading them

- The records were written while the branches were in flight, against an internal plan that is
  not part of the repository. Identifiers such as `F-13`, `IT-1`, `S-3`, `W2-5` or `C13` (the
  plan's amendments and decisions), spec steps (`B5`, `S10`) and *waves* (the order the branches
  were merged in: foundation and test harness, then the features in parallel, then the work that
  needed several features) name entries of that plan. Each record states the decision it applies,
  so it reads without the plan.
- File paths are those of the merge; `fix/final-polish` later moved the menu session to
  `src/ui/app/session/` and the run view's terminal modules to `src/ui/run/terminal/`, and the
  records say so where it matters.
- "Hand-off" sections list what a record left to a later branch; the ones that were done say so.

## Adding a record

A change that adds an extension point, a process, a file gup writes or a security-relevant
behaviour gets a record here in the same pull request, and updates the reference pages above.
The shape that served 0.5.0:

1. **Status** — the branch, what it builds on, what it leaves out.
2. **What the user gets** — one table.
3. **Architecture** — modules, contracts, a diagram when it explains a flow.
4. **Security** and **cross-platform** notes.
5. **Tests** — the suites and what each one holds.
6. **Decisions and deviations** — each with its reason.

List it in the table above and in the [documentation index](../../README.md).
