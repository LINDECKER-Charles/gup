# Contributing

[![CI](https://github.com/LINDECKER-Charles/gup/actions/workflows/ci.yml/badge.svg)](https://github.com/LINDECKER-Charles/gup/actions/workflows/ci.yml)
[![Pages](https://github.com/LINDECKER-Charles/gup/actions/workflows/pages.yml/badge.svg)](https://lindecker-charles.github.io/gup/)
[![TypeScript](https://img.shields.io/badge/typescript-strict-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vitest](https://img.shields.io/badge/tested%20with-vitest-6E9F18?logo=vitest&logoColor=white)](https://vitest.dev/)

Thanks for contributing. The typical contribution is **adding a provider** — an isolated module that knows how to scan and update one package source.

By participating in this project — issues, pull requests, reviews — you agree to abide by its [Code of Conduct](CODE_OF_CONDUCT.md).

> Before diving in: read [`docs/development/architecture.md`](../docs/development/architecture.md) for context (lifecycle, runner, parallel scan, data model).
>
> Looking for help rather than contributing code? See [SUPPORT.md](SUPPORT.md). How the project is run and who decides what: [GOVERNANCE.md](GOVERNANCE.md).

---

## Table of contents

- [0. Ways to contribute](#0-ways-to-contribute)
- [1. Local setup](#1-local-setup)
- [2. Provider-addition workflow](#2-provider-addition-workflow)
- [3. Provider anatomy](#3-provider-anatomy)
- [4. Mandatory conventions](#4-mandatory-conventions)
- [5. Edge cases](#5-edge-cases)
- [6. Tests & quality before PR](#6-tests--quality-before-pr)
- [7. Code style](#7-code-style)
- [8. Branches, commits and scopes](#8-branches-commits-and-scopes)
- [9. Pull request flow](#9-pull-request-flow)
- [10. Documentation](#10-documentation)
- [11. Reporting a bug](#11-reporting-a-bug)

---

## 0. Ways to contribute

| Contribution | Where to start |
|---|---|
| Report a bug | The [*Bug report*](https://github.com/LINDECKER-Charles/gup/issues/new?template=bug_report.yml) form — see [§ 11](#11-reporting-a-bug) for what helps most |
| Request a provider | The [*New provider*](https://github.com/LINDECKER-Charles/gup/issues/new?template=provider_request.yml) form: the commands to list and update the packages of that source |
| Add a provider | [§ 2](#2-provider-addition-workflow): usually one file, one registry line and its tests |
| Improve the documentation | [`docs/`](../docs/README.md), in English — see [§ 10](#10-documentation) |
| Improve the landing page or its translations | [`index/`](../index/), a static Vite + React site (`cd index && npm ci && npm run build`, then `npm run verify`, which drives Playwright's Chromium); commit scope `landing` |
| Triage | Reproduce open bugs on your platform, ask for missing details, point duplicates to the original issue |

A change of behaviour starts as a [*Feature request*](https://github.com/LINDECKER-Charles/gup/issues/new?template=feature_request.yml) — why is in [GOVERNANCE.md § How decisions are made](GOVERNANCE.md#how-decisions-are-made).

---

## 1. Local setup

```powershell
git clone https://github.com/LINDECKER-Charles/gup.git
cd gup
npm install
npm run build
npm link            # exposes gup globally (optional)
```

Requirements: **Node ≥ 26.9**, any shell — the interactive UI is OpenTUI, whose native renderer loads through `node:ffi`, on by default from 26.9. To iterate without rebuilding: `npm run dev -- <args>` (uses `tsx`).

Install Node through a version manager rather than over your system Node, so this floor does not fight your other projects: [nvm-windows](https://github.com/coreybutler/nvm-windows), [fnm](https://github.com/Schniz/fnm) or [Volta](https://volta.sh/) on Windows; fnm, Volta or [nvm](https://github.com/nvm-sh/nvm) on macOS and Linux. On an older Node, npm only warns (`EBADENGINE`), then the UI tests and the interactive app fail to load.

### node-pty, the optional native dependency

[node-pty](https://github.com/microsoft/node-pty) is the pseudo-terminal behind updates that run inside the interactive app. It is an **optional** dependency with install scripts, so `npm install` behaves differently per OS:

| OS | What `npm install` does with node-pty | Without it |
|---|---|---|
| Windows, macOS | uses the prebuilt binary it ships; npm 11 prints an `install-scripts` warning for it, which is expected | — |
| Linux | compiles it with node-gyp: needs Python 3 and a C/C++ toolchain (`build-essential`, or your distribution's equivalent). If the build fails, npm skips the optional dependency and the install still succeeds | the menu updates outside the screen, and the real-PTY integration and end-to-end suites skip on Linux (they fail on Windows and macOS, where node-pty must load) |

`GUP_PTY=off` turns the embedded terminal off for a run, to test the fallback. Why the install scripts are there and what users see: [installation.md § npm 11 and install scripts](../docs/guide/installation.md#npm-11-and-install-scripts).

### Deliberate version pins

They show up in `npm outdated` or as Dependabot pull requests; none is an oversight, so please don't "fix" them without checking these reasons still hold.

| Package | Pinned to | Why |
|---|---|---|
| `typescript` | `^6` | typescript-eslint does not support the TypeScript 7 API yet — `npm run lint` and `npm run lint:security` both fail outright on TS 7 ([typescript-eslint#10940](https://github.com/typescript-eslint/typescript-eslint/issues/10940)). `tsc --noEmit` and the build are fine on 7; the linters are the blocker. |
| `@types/node` | `^26` | Matched to the `engines.node` floor on purpose. Typing against the *minimum* supported runtime is what makes `tsc` reject an API that only exists on a newer Node line — bumping these types to the latest silently removes that guard. Raise it only together with `engines`. |
| `@opentui/core` | exact | A young API with a native renderer: the screen host's teardown order (conhost), the embedded terminal, frame timing and the screenshot generator are checked against this version. |
| `node-pty` | exact | gup releases each Windows pseudo-console through node-pty internals that are checked against the pinned version (a unit test ties the pin to `package.json`); a bump means re-checking `releaseConpty` in `src/core/pty/pty-session.ts`. |
| `croner` | exact | Schedules are evaluated by it: a behaviour change in cron parsing or DST handling would move users' updates. |

---

## 2. Provider-addition workflow

```mermaid
flowchart TD
    Start([Source to integrate]) --> Scope{In scope?}
    Scope -->|no| OutOfScope[read docs/guide/scope.md]
    Scope -->|yes| Copy[Copy _template.ts<br/>into the right category]
    Copy --> Impl[Implement the 4 methods<br/>isAvailable / listOutdated / update / updateAll]
    Impl --> Register[Import + add to<br/>ALL_PROVIDERS in registry.ts]
    Register --> Smoke[Smoke test:<br/>tsx src/cli.ts doctor<br/>tsx src/cli.ts list --provider id]
    Smoke --> Pass{Detected?<br/>Scan ok?<br/>Update ok?}
    Pass -->|no| Impl
    Pass -->|yes| Case[Contract case in<br/>tests/providers/&lt;domain&gt;/*.cases.ts]
    Case --> Tests[npm run typecheck<br/>npm run lint<br/>npm run test:run<br/>npm run security]
    Tests --> Doc[Update docs/guide/providers-catalog.md<br/>+ the provider count in README.md]
    Doc --> PR([Pull Request])
```

### 2.1 Pick the category

The file goes into `src/providers/<category>/`. Existing categories: `os/`, `wsl/`, `node/`, `python/`, `rust/`, `dotnet-php/`, `jvm/`, `lang-other/`, `toolchain/`, `cloud/`, `iac/`, `kubernetes/`, `containers/`, `security/`, `dev-cli/`, `ide/`, `editor-plugins/`, `embedded-mobile/`, `shell/`. See [`docs/development/architecture.md`](../docs/development/architecture.md#14-tree-layout) for the full map.

Only create a new category if **3+ providers** would logically fall into it — otherwise drop the file into `lang-other/` or `dev-cli/`.

### 2.2 Copy the template

```powershell
Copy-Item src/providers/_template.ts src/providers/<category>/<your-provider>.ts
```

The template (`src/providers/_template.ts`) ships with the correct imports and the minimal signature.

### 2.3 Register it

In `src/core/registry.ts`:

```ts
import { YourProvider } from "../providers/<category>/<your-provider>.js";

export const ALL_PROVIDERS: Provider[] = [
  // ...
  new YourProvider(),
];
```

The order in the array drives the display order in `gup doctor` — group conceptually related providers together.

### 2.4 Smoke test

```powershell
npm run typecheck
npx tsx src/cli.ts doctor                       # provider detected?
npx tsx src/cli.ts list --provider <your-id>    # scan correct?
npx tsx src/cli.ts update <your-id>:<pkg>       # update works?
```

### 2.5 Tests

A new provider gets at least one **contract case** in
`tests/providers/<domain>/<domain>.cases.ts`: the simulated machine it runs on (binaries, the
probe output, the HTTP answers) and the rows it must return. The contract then generates the
detection, fail-soft, argv and `updateAll` tests, replays the scan under every fault it can
inject, and the platform simulation runs the case on every other OS the provider supports. A
non-trivial parser or a multi-step update also gets a knowledge test
(`tests/providers/<domain>/<your-id>.test.ts`), ideally on output recorded from the real tool
(`npm run fixtures:record -- --provider <your-id>`). How and why:
[`docs/development/testing.md`](../docs/development/testing.md#4-where-does-my-test-go).

---

## 3. Provider anatomy

What gup calls on your provider, and what your provider calls back:

```mermaid
sequenceDiagram
    autonumber
    participant Registry
    participant Pipeline as update pipeline
    participant P as YourProvider
    participant Runner as core/runner.ts
    participant Tool as External tool

    Note over Registry: skipped on an OS outside your platforms
    Registry->>P: isAvailable()
    P->>Runner: commandExists("your-bin")
    Runner-->>P: boolean
    P-->>Registry: available

    Registry->>P: listOutdated()
    P->>Runner: run("your-bin", ["list", "--outdated"])
    Runner->>Tool: spawn argv, output captured
    Tool-->>Runner: stdout
    Runner-->>P: { stdout, failed }
    P->>P: parse stdout → OutdatedPackage[]
    P-->>Registry: OutdatedPackage[]

    Note over Pipeline: the user checks packages, one call per package
    Pipeline->>P: update("pkg-id") through applyUpdate
    P->>Runner: runInherit("your-bin", ["upgrade", "pkg-id"])
    Runner->>Tool: spawn argv in the active sink
    Note over Runner,Tool: user's terminal · embedded terminal pane · pipe to the log
    Tool-->>Runner: exit code
    Runner-->>P: { failed }
    P-->>Pipeline: UpdateOutcome
```

Your provider never knows where its install runs: `runInherit` gives it the user's terminal (`gup update`), a pane of the embedded terminal (the interactive app) or a pipe to the debug log (a scheduled run). The pipeline records the outcome, batches `requiresAdmin` rows behind one elevation prompt and offers retries — see [architecture.md § Update pipeline](../docs/development/architecture.md#6-update-pipeline).

### Signature

```ts
import { commandExists, run, runInherit } from "../../core/runner.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

export class YourProvider implements Provider {
  readonly id = "your-tool";              // unique, kebab-case, stable
  readonly displayName = "Your Tool";
  readonly installHint = "winget install YourTool";
  readonly slow = false;                   // true if scan = HTTP per package

  async isAvailable(): Promise<boolean> {
    return commandExists("your-bin");
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const { stdout, failed } = await run("your-bin", ["list", "--outdated"]);
    if (failed) return [];
    // parse stdout → OutdatedPackage[]
    return [];
  }

  async update(packageId: string): Promise<UpdateOutcome> {
    const res = await runInherit("your-bin", ["upgrade", packageId]);
    return { id: packageId, success: !res.failed };
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    const res = await runInherit("your-bin", ["upgrade", "--all"]);
    return packages.map((p) => ({ id: p.id, success: !res.failed }));
  }
}
```

### Return semantics

```mermaid
flowchart LR
    Update[update returns] --> Success{success?}
    Success -->|true| OK["√ updated"]
    Success -->|false + skipped| SKIP["→ skipped<br/>manual action"]
    Success -->|false + retryable| RETRY["× failed<br/>+ retry offer"]
    Success -->|false| FAIL["× failed"]
```

- `success: true` → success.
- `success: false, skipped: true` → action requires the user (manual download, GUI). Neither failure nor success; never retried.
- `success: false, retryable: true` → the failure can be worked around with `--force`/`uninstallPrevious`/`reinstall`. Counted as a failure, and the user is offered a retry (never under `-y`, never in a scheduled run).
- `success: false` → real failure, message in `message`.
- Throwing is caught (`erreur inattendue : …`) but is a bug: return an outcome.

---

## 4. Mandatory conventions

| Rule | Why |
|---|---|
| **One file = one provider** | No coupling. Removal is trivial. |
| **No `throw` inside `listOutdated` / `update`** | A broken provider must not break the global scan. Return `[]` or `success: false`. The one exception: a scan the tool itself reports as failed (npm's `{"error": …}`, an `ERR_PNPM_…` code) throws an `Error` naming it, so it shows as a scan error rather than as "up to date". |
| **`run` / `runInherit` only** — never `child_process` | Windows-safe encoding, `shell: true` forbidden (security allowlist aside). |
| **`fetch` with `AbortSignal.timeout(5_000)`** | No scan hanging on a slow upstream. |
| **HTTPS only** in `fetch` | Pinned by `tests/security/http-targets.test.ts`. |
| **`slow: true`** if scan does HTTP-per-package or FS walk | Lets `--fast` skip it. |
| **`readonly platforms = PLATFORMS.windows`** (or `macos`, `notWindows`) when gup supports the source on some OSes only — never test `process.platform` in `isAvailable()`, and no install hint for the other OSes | The registry is the only gate: elsewhere the provider is never probed, scanned or updated, and listings grey it out without a hint. Pinned by `tests/core/platform/platform-gate-source.test.ts`. |
| **`skipped: true`** when the provider knows no automation is possible | Avoids a false `FAIL`. |
| **`manual: true`** in `OutdatedPackage` for an item no command can update | `scanAll` filters it — the item never shows up in lists. A source whose every item is manual gets no provider (§5.3). |
| **`requiresAdmin: true`** on a row whose update needs UAC or `sudo` (Chocolatey goes through `flagForElevation`) — never prompt from `update()` | The pipeline runs every such row in one elevated batch behind one prompt; inside it, your provider already has the rights. |
| **`readonly canUpdateUnattended = false`** when *every* update needs an administrator | Scheduled runs never elevate: such a provider cannot be scheduled, and the menu says why. |
| **`aggregate: true`** on a row whose update acts on the whole provider ("all plugins", a refresh marker) | A schedule names packages, never a provider: such a row is never a scheduling target. |
| **`options.unattended`** honoured when your tool can stop on a prompt (winget: `--disable-interactivity`) | A scheduled run has nobody to answer; a prompt must fail fast instead of holding the run until its timeout. |
| **No `console.*`, no direct stdout or stderr** — `log.debug("domain.action", data)` for diagnostics | Output while the full-screen app is mounted would paint over it; the debug log records what you need (drift test: `tests/security/provider-output.test.ts`). |
| **No new npm dependency without discussion** | Footprint is intentionally minimal. |

---

## 5. Edge cases

### 5.1 HTTP-heavy providers (gh releases, etc.)

Use `core/gh-releases.ts` or `core/hashicorp-releases.ts` when the tool publishes via GitHub/HashiCorp. These helpers handle timeout, parsing, and basic rate-limiting.

### 5.2 WSL providers

Inherit the pattern in `src/providers/wsl/` — the helper `core/wsl.ts` bridges `wsl -d <distro> -- <cmd>` and exposes the list of detected distros.

### 5.3 "Manual-only" providers

If **every** update requires a GUI action (e.g. JetBrains plugins, Eclipse Marketplace features), do **not** write the provider: every row would be `manual: true`, which `scanAll` drops, so the code would only cost scan time and maintenance. List the source as a candidate (⬜) in [`docs/guide/providers-catalog.md`](../docs/guide/providers-catalog.md) instead, saying why — see the comment among the IDE imports of `src/core/registry.ts`.

### 5.4 Providers sharing a binary with another

Use `core/install-source.ts` to decide who owns the binary (`whichFirst` → path → PM mapping). Security-critical: any change is pinned by `tests/security/install-source.test.ts`.

### 5.5 winget-like providers with retry

Mark outcomes `retryable: true` when the upstream error message suggests `--force` would help (hash mismatch, app running). Branch on `options.force` / `options.uninstallPrevious` / `options.reinstall` inside `update` — see `src/providers/os/winget.ts` for the reference.

---

## 6. Tests & quality before PR

```powershell
npm run typecheck             # tsc on src, then on the tests, the tooling and the configs
npm run lint                  # eslint on src, tests and scripts
npm run test:run              # the unit, providers and integration projects
npm run test:e2e:smoke        # build, then the built CLI in a sandbox and in a real terminal
npm run security              # audit-ci + lint:security + test:security
npm run screenshots:check     # after a change to the interactive app: are the docs' screenshots current?
```

A change to what the interactive app draws — a label, a key hint, a layout — changes the generated screenshots in `docs/assets/screens/`: run `npm run screenshots` and commit the result with the change. CI's **Screenshots up to date** step fails otherwise ([documentation.md § Screenshots](../docs/development/documentation.md#screenshots)).

On Windows, `scripts\check.cmd` runs all of them and prints one summary
(`scripts\check.cmd -E2E full` adds the real tools of your machine, read-only). The tests need
Node ≥ 26.9. Where a new test goes, how to run one layer, the end-to-end suites, CI and the manual
checklists:
[`docs/development/testing.md`](../docs/development/testing.md).

Cross-platform CI: **Windows** + **macOS** + **Ubuntu**, Node **26**. Every PR that adds a provider must pass all three.

Because the matrix now runs on three OSes, a provider must never build a path with the platform-dependent `path.join` inside a platform-specific branch: use `path.win32.join` for a Windows path and `path.posix.join` for a POSIX one. Otherwise the unit tests — which mock `process.platform` — only pass on a matching runner.

### Coverage

There is no percentage to reach. A behaviour ships with the test that would fail if it broke;
the modules where an untested branch can do harm (the runner, install-source, elevation, the
update pipeline, the scheduler, log redaction…) have coverage floors that CI enforces
([`testing.md` §8](../docs/development/testing.md#8-coverage)).

---

## 7. Code style

- **Strict TypeScript** + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`. No casts unless necessary.
- **No comments describing the WHAT** — only the WHY when non-obvious. A well-named identifier beats a comment.
- **`.js` extensions** in import paths (ES-module extension, even for `.ts` sources).
- **No `any`**, no unnecessary `as`.

### Language

**English** for code, identifiers, comments, JSDoc, configuration comments, documentation (including release notes) and commit messages: contributors and bug reports arrive in English, and a half-French code base forces every reader to switch languages mid-file.

**French** for every string the user sees at runtime: CLI output, install hints, menu labels, dialogs. That is the language of the interface, not an oversight — see the note in the [CLI reference](../docs/guide/cli-reference.md).

### Size and complexity limits

These apply to `src/**` and are **gates, not review preferences**: `npm run lint` fails on the ones marked *lint*, in CI as locally.

| Rule | Limit | Enforced by |
|---|---|---|
| File length | ≤ 300 lines (alert), 400 maximum | lint (`max-lines`, 400) |
| Function / method length | ≤ 30 lines | lint (`max-lines-per-function`) |
| Parameters | ≤ 3 — group the rest in an object | lint (`max-params`) |
| Nesting depth | ≤ 3 levels | lint (`max-depth`) |
| Cyclomatic complexity | ≤ 10 per function | lint (`complexity`) |
| Unused imports, variables, parameters | none | lint (`no-unused-vars`) and `npm run typecheck` (`noUnusedLocals`, `noUnusedParameters`) |
| Line length | ≤ 100 characters | review |
| Files per folder | ≤ 10 — split into sub-folders by domain | review |

Comment and blank lines do not count (`skipComments`, `skipBlankLines`): the limits cap how much a reader must hold in their head, and counting comments would push people to delete explanations to get green.

`tests/**` and `scripts/**` are exempt from the size limits but keep `max-params`, `complexity` and the unused-code rule: a long test file measures coverage, a complex test function usually checks too many things at once.

Two **named exceptions**, where the rule is miscalibrated rather than the code:

- `src/core/registry.ts` (file length), disabled in `eslint.config.js` with the reason next to it: the flat catalogue of providers, one import and one instantiation each. Splitting it would add files without reducing what a reader must understand.
- `src/providers/<domain>/` (files per folder, a review rule): the domain folder already is the unit of splitting the rule asks for; a sub-level such as `kubernetes/cluster/` would add navigation without adding meaning.

A one-off exception elsewhere needs an inline `eslint-disable` with a comment that justifies it.

### Structure

- **One public element per file** (a class, a component or a module), named like the file.
- **No magic numbers or strings**: extract them into named constants that say what they mean.
- **No dead code**: no unused import, variable, function, class or type. A refactor that moves code takes its imports with it. A parameter a signature imposes but the body does not use is prefixed with `_`. An export that only exists for tests says so in a comment.
- **One function, one job**: guard clauses over nested `if`/`else`, no boolean flag parameters that switch behaviour, and a function either changes state or returns a value, not both.

---

## 8. Branches, commits and scopes

### Branches

```
type/short-description
```

- The **type** is one of the commit types below, always in its short form: `feat/`, never `feature/`.
- The **description** is 2 to 5 words in kebab-case, ASCII only, saying what the branch is about: `fix/winget-pinned-packages`, `docs/release-guide`.
- **One branch, one subject.** It starts from `main` and comes back through a pull request.

### Commits

[Conventional Commits](https://www.conventionalcommits.org/):

```
type(scope): description
```

- **English, imperative mood**, lowercase after the colon, no trailing period: `fix(core/runner): close the child's stdin before waiting`.
- **Subject ≤ 72 characters.** The body is optional and explains *why*; the diff already shows *what*.
- **Breaking changes** carry a `BREAKING CHANGE:` footer, and the release notes say how to upgrade.
- **One commit, one coherent change.** Never mix two subjects in a commit.
- **Tests travel with the code they test**, in the same commit, never in a separate one. Release notes (`docs/releases/**`) and changelog entries travel with the commit they document.

| Type | Use |
|---|---|
| `feat` | a new capability (provider, command, flag, view) |
| `fix` | a bug fix |
| `docs` | documentation only |
| `refactor` | restructuring without a behaviour change |
| `perf` | a performance improvement |
| `test` | adding or fixing tests on their own (rare: tests usually travel with code) |
| `style` | formatting, no change in meaning |
| `build` | dependencies, build and lint tooling |
| `ci` | GitHub Actions workflows and Dependabot configuration |
| `chore` | maintenance that fits no other type, release bumps |
| `revert` | reverting an earlier commit |

### Scope map

The scope says where the change lives. It is **required** whenever the changed files are covered by a row below.

| Files changed | Prefix | Example |
|---|---|---|
| `src/core/**` | `type(core)`, or `type(core/<module>)` when the change stays in one module | `fix(core/runner): …` |
| `src/providers/<domain>/**` | `type(providers/<domain>)`; `type(providers)` when several domains change | `feat(providers/cloud): …` |
| `src/cli.ts`, `src/commands/**` | `type(cli)` | `feat(cli): …` |
| `src/ui/**` | `type(ui)` | `fix(ui): …` |
| `src/report/**` (the HTML report) | `type(report)` | `fix(report): …` |
| `src/pty-exec.ts` (the PTY trampoline) | `type(core/pty)`, with the module it belongs to | `perf(core/pty): …` |
| `tests/**` | the scope of the code under test, in the same commit | — |
| `.github/workflows/<name>.yml` | `ci(<name>)` | `ci(security): …` |
| `.github/dependabot.yml` | `ci(dependabot)` | `ci(dependabot): …` |
| `index/**` (landing page) | `type(landing)` | `feat(landing): …` |
| `.github/SUPPORT.md`, `.github/GOVERNANCE.md`, `.github/ISSUE_TEMPLATE/**`, `.github/PULL_REQUEST_TEMPLATE.md`, `.github/CODEOWNERS` | `docs(community)` | `docs(community): …` |
| `docs/**`, `README.md`, `.github/CONTRIBUTING.md`, `.github/SECURITY.md`, `CHANGELOG.md`, `CITATION.cff` | `docs`, optionally with the topic as scope | `docs(changelog): …` |
| `package.json`, `package-lock.json`, `tsconfig.json`, `tsup.config.ts` | `build(deps)`; Dependabot bumps use `chore(deps)` / `chore(deps-dev)` | `build(deps): …` |
| `eslint.config*.js`, `vitest.config.ts`, `tests/tsconfig.json`, `audit-ci.json`, `.semgrep.yml`, `.gitleaks.toml` | `build(lint)` | `build(lint): …` |
| `scripts/**`, `.gitignore`, `.gitattributes` | `chore`, no scope | `chore: …` |
| The version bump of a release | `chore(release): x.y.z` | `chore(release): 0.4.0` |

---

## 9. Pull request flow

How a contribution reaches `main`:

```mermaid
flowchart TD
    Idea(["Bug, idea or new provider"]) --> Issue["Open an issue<br/>bug · feature · provider · question form"]
    Issue --> Triage{Maintainer triage}
    Triage -->|out of scope| Close(["Closed, reason linked to scope.md"])
    Triage -->|accepted| Branch["Fork + branch<br/>type/short-description"]
    Branch --> Code["Code + tests + docs<br/>+ changelog fragment"]
    Code --> Local["Local checks<br/>typecheck · lint · test:run · security"]
    Local --> PR["Pull request<br/>template checklist"]
    PR --> CI{"Required checks<br/>test × 3 OS · security tests + eslint<br/>npm audit · codeql · semgrep · gitleaks"}
    CI -->|red| Code
    CI -->|green| Review{"Review<br/>threads resolved?"}
    Review -->|changes requested| Code
    Review -->|approved| Merge(["Maintainer merges into main"])
```

1. **Keep a pull request to one subject.** Two unrelated fixes are two pull requests.
2. **Fill in the template**: what and why, the linked issue (`Closes #123`), the checklist, what you tested by hand.
3. **Add a changelog fragment** as `docs/changelog/unreleased/<branch-slug>.md`, where `<branch-slug>` is your branch name without its type (`fix/winget-pinned-packages` → `winget-pinned-packages.md`). Use the headings and the bullet shape described in the [changelog guide](../docs/changelog/README.md#how-to-read-an-entry); fragments are folded into `unreleased.md` before a release, so parallel pull requests never edit the same file.
4. **Required checks.** The `main` ruleset blocks the merge until these eight checks pass:

   | Check | Workflow | What it runs |
   |---|---|---|
   | `test (node 26 / windows-latest)` | `ci.yml` | typecheck (src and tests), build, the unit, providers and integration tests, the end-to-end smoke on Windows |
   | `test (node 26 / macos-latest)` | `ci.yml` | the same on macOS |
   | `test (node 26 / ubuntu-latest)` | `ci.yml` | the same on Linux, plus lint, security lint, the coverage floors and **Screenshots up to date** |
   | `security tests + eslint` | `security.yml` | the `eslint-plugin-security` ruleset and the security test suite |
   | `npm audit (audit-ci)` | `security.yml` | known advisories in the dependency tree (`audit-ci.json`) |
   | `codeql` | `security.yml` | CodeQL `security-extended` and `security-and-quality` queries |
   | `semgrep` | `security.yml` | the rules in `.semgrep.yml` plus the `p/typescript` and `p/nodejs` packs |
   | `gitleaks` | `security.yml` | secret scan of the whole history (`.gitleaks.toml`) |

   The `docs` workflow (`docs.yml`) also checks Markdown links and anchors when documentation changes. It is not required — a path-filtered workflow cannot be — but a red run is fixed before merging. Neither are `packed install` (`ci.yml`: the packed tarball installed without its install scripts on Windows and macOS, then `gup doctor`) and the `e2e` workflow (the full end-to-end suites on real macOS and Windows runners, weekly or with the `e2e-full` label), but a red run there is read before merging too.
5. **Review.** Every review conversation must be resolved before the merge.
6. **Merge.** The maintainer merges, with a merge commit that keeps your commits as they are — which is why their messages matter. The repository admin can bypass the ruleset; contributions are merged with all eight checks green.

---

## 10. Documentation

- Documentation is **English**. French UI labels are quoted verbatim, in **bold**, with an English gloss on first use: "**Paquets** (packages)".
- Users' pages go to `docs/guide/`, contributors' pages to `docs/development/`; the [documentation index](../docs/README.md) lists every page and must list a new one.
- **Mermaid** diagrams are welcome in `docs/` and in this file when they explain a mechanism: stable diagram types only (`flowchart`, `sequenceDiagram`, `stateDiagram-v2`, `classDiagram`, `gitGraph`), about 20 nodes at most, no custom colours. Check that they render in the pull request's rich diff.
- **`README.md` is also the npm page**, and npm renders neither Mermaid nor relative image paths: no diagrams there, and images by absolute `raw.githubusercontent.com` URL.
- **Screenshots are generated**, never captured by hand: `npm run screenshots` renders the real views on fixture data into `docs/assets/screens/`. A UI change commits them regenerated; a new view gets a scene ([how](../docs/development/documentation.md#adding-a-scene)).
- A behaviour change updates the page that documents it in the same pull request; a new provider updates the [providers catalog](../docs/guide/providers-catalog.md) and the provider count in the README.
- A change that adds an extension point, a process, a file gup writes or a security-relevant behaviour also updates [`architecture.md`](../docs/development/architecture.md) (and [`SECURITY.md`](SECURITY.md) when it changes the threat model), and gets a [design record](../docs/development/design/README.md#adding-a-record).

The full conventions — where a page goes, the Mermaid rules, the screenshot pipeline, link checking: [`docs/development/documentation.md`](../docs/development/documentation.md).

---

## 11. Reporting a bug

Use the [*Bug report*](https://github.com/LINDECKER-Charles/gup/issues/new?template=bug_report.yml) form; [SUPPORT.md](SUPPORT.md#what-to-include) lists what to include. A provider bug also needs:

- the output of `gup list --provider <id> --json`, or a redacted snippet if the data is sensitive;
- the version of the tool behind the provider (`<bin> --version`).

---

## Reporting a vulnerability

See [`SECURITY.md`](SECURITY.md). **Do not** open a public issue with a reproducer — file a [private GitHub security advisory](https://github.com/LINDECKER-Charles/gup/security/advisories/new) instead.
