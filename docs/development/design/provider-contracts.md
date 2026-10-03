# Design note — provider test migration (`test/provider-contracts`)

Branch `test/provider-contracts` (wave 2), testing spec steps S4 (pilot), S6, S7 and part of S5
and S8, under the migration safety rules R1–R4. The branch lands in three parts:

| Part | Domains migrated |
|---|---|
| 1 | the `iac` pilot, the whole `os` domain, and `pkg-gaps.test.ts` split into `lang-other` and `dotnet-php` |
| 2 | `rust`, `jvm`, `dotnet-php`, `lang-other`, `toolchain` (with `toolchain-gaps.test.ts` split into `embedded-mobile`, `toolchain`, `python` and `node`), `python`, `node`, and the `self` pair |
| 3 (to come) | the remaining flat suites (§7), the fixture recorder (S11) and the removal of the `providers-legacy` project (amendment X-1) |

Read with: [`test-harness.md`](test-harness.md) (the fake machine and the contract harness
this branch builds on) and the testing spec (`specs/testing.md`, §5.5 and §11).

---

## 1. What a migrated domain looks like

```
tests/providers/<domain>/
  <domain>.cases.ts      contract cases: pure data + factories, no vitest import
  contract.test.ts       defineProviderContract({ domain, cases })
  <provider-id>.test.ts  knowledge tests only, on the fake machine
```

- A domain whose cases would pass about 500 lines splits them by family, and its
  `contract.test.ts` runs every file: `os` (`windows.cases.ts`, `posix.cases.ts`), `iac`
  (`iac.cases.ts`, `hashicorp.cases.ts`), `dotnet-php` (`dotnet-php.cases.ts` for .NET,
  `php.cases.ts`), `lang-other` (`lang-other.cases.ts` for the package managers,
  `self-updating.cases.ts` for cabal, Stack, Hex and Flutter) and `node` (`node.cases.ts`
  for the package managers, `runtimes.cases.ts` for Deno and the version managers).
- `embedded-mobile/` exists with xcodes only, out of `toolchain-gaps`; its other providers
  join it when `embedded-mobile.test.ts` migrates (part 3).
- `self/` holds the meta-provider of the package managers' own updates (`src/providers/self.ts`,
  outside any domain).
- A case file exports its cases array, and only the machines and sample outputs a knowledge
  test of the domain starts from. Knowledge files are named after the provider's source file.

What goes where, as applied:

| Old test | New home |
|---|---|
| detection, "returns [] when the probe/API fails", "current == latest", updateAll empty / shape / bulk failure, update failure | generated contract tests (§2) |
| exact rows of a nominal scan, notes, `requiresAdmin`, install argv, batch argv | the case data (`outdated`, `update`, `batchInstalls`, `routes`) |
| parsers, multi-step updates, safety rules, fallbacks, platform guards, odd environments | `<provider-id>.test.ts`, on the fake machine |
| `expect(mock).toHaveBeenCalledWith(...)` side assertions | dropped (R1 reason 2): the strict machine fails on any unscripted spawn or request, and the trace carries what was spawned, read and fetched; kept as a trace assertion where the absence is the point ("asks GitHub nothing when…", "never runs `xcodes update`") |

## 2. Harness extensions

All additive (no existing member changes meaning for an existing case); each is covered by
self-tests under `tests/support/self-test/` or, for the case builders, by every case built
with them.

| Extension | Where | Why |
|---|---|---|
| `ProviderContractCase.routes` (`UpdateRoute`) and the generated test "routes the update to the installer that owns the binary" | `contract/types.ts`, `contract/checks.ts` | About fifty providers hand their upgrade to whichever installer owns the binary. One test per case checks the argv every installer receives through the real `install-source`, instead of a `delegateUpdate` mock's arguments. Route violations count for the dead-waiver check. |
| `installedVia`, `upgradeArgv`, `delegationRoutes(binary, delegation, extra?)` | `contract/installers.ts` | Machines where scoop, winget, choco, brew, apt (dpkg), dnf (rpm) or nobody owns a binary, and each installer's upgrade argv stated literally; a route per installer from a provider's ids. |
| `releasedToolCases`, `nothingListedCase` | `contract/released-tool.ts` | The commonest provider shape (a binary, a release API, a delegated upgrade) as three scenarios: scoop + routes, manual install, up to date. |
| `selfUpdatingToolCases`, `nothingListedOn`, `withRelease` (part 2) | `contract/self-updating-tool.ts` | Its counterpart for a tool that upgrades itself (Coursier, JBang, Composer, PHIVE, cabal, Stack, Hex, Flutter, goenv, SDKMAN!, Conda, PDM, Poetry, Rye, pyenv-win, Deno): behind (one row, the self-update collapsed, an optional `onFailure`) and up to date; `nothingListedOn` for a valid answer without the expected field. |
| `githubLatest`, `hashicorpLatest` | `system/releases.ts` | Release API routes with the minimal real payload. |
| `ProviderContractCase.batchInstalls` and the generated test "reports a failed updateAll as failed outcomes" | `contract/*` | Batch commands (`brew upgrade --formula`, `choco upgrade all -y`…) are pinned in the case, and a batch whose installs all fail may not report a success (every shape but `skipped`). |
| A collapsed `updateAll` is handed every row twice (part 2) | `contract/checks.ts` | "One update whatever the row count" cannot be told from per-package with the single row a self-updater lists; replaces the four "still updates once for several rows" tests of the toolchain gaps. |
| A collapsed shape counts the installs of its one update, and an update left to the user counts none (part 2) | `contract/invariants.ts`, `contract/checks.ts` | nvm's update is two installs (`git fetch --tags`, `git checkout <tag>`), and nvm on a checkout past the release runs none; both were impossible to declare. |
| `CommandScript.afterInstall` | `system/*` | The answer once an install has run: pkgin and MSYS2 re-query after their upgrade, pnpm compares its version before and after. |
| `SpawnRecord.timeout`, `SpawnRecord.env` (part 2) | `system/fake-runner.ts` | The wall-clock cap a scan asks the runner for (Fink, pkgin); the environment a spawn is handed (nvm passes its directory through the environment, never the script). |
| `HttpRoute.finalUrl` | `system/*` | `Response.url` after redirects: Sparkle refuses a chain that left TLS. |
| `installs()`, `installArgvs()`, `probeArgvs()` | `system/trace.ts` | Readers of the trace for knowledge tests. |
| `replaceForTest(module, name, implementation)` | `system/boundary-spy.ts` | A spy on a faked boundary module for one test, restored after it: for the failures Node never produces on its own but providers guard against (`existsSync` throwing, `homedir()` without a passwd entry, an elevation probe that rejects), and to assert a guard probed nothing. |

## 3. Migration safety (R1–R4), as run

- **R1 ledger.** Every deleted `it` is mapped in the body of the commit that deletes it: to a
  generated test, a kept knowledge test (file and title), or "dropped" with an allowed reason.
- **R2 coverage delta.** `scripts/coverage-delta.mjs` compares two Vitest `json-summary`
  reports file by file (`--scope` prefixes, `--metric`, `--tolerance`, exit 1 on a
  regression, 2 on a usage error). Baseline: the `int/wave-1` report (amendment H-3).

  ```bash
  node node_modules/vitest/vitest.mjs run --coverage --coverage.reporter=json-summary \
    --coverage.reportsDirectory=<dir>
  node scripts/coverage-delta.mjs --baseline <int-wave-1>/coverage-summary.json \
    --current <dir>/coverage-summary.json --scope src/providers/os/ --metric branches --metric lines
  ```

- **R3 seeded mutations.** Three per migrated set (an install argv, a version regex, a removed
  try/catch, or the closest fail-soft guard where a domain has no try/catch), applied to
  `src`, run against the domain's tests, reverted. A mutation counts as caught only when a
  test fails, not when the suite fails to load. Results are in the commit bodies and §5.
- **R4 same-commit swap.** Each flat file is deleted in the commit that adds its replacement.

## 4. Deviations from the testing spec

| # | Spec | Shipped | Why |
|---|---|---|---|
| D1 | One scenario per package manager a delegating provider maps | One case per provider with `routes` (one generated test covering every installer) | Same assertions (real argv per installer), without multiplying every generated test and fault sweep by five. |
| D2 | — | Valid answers missing the expected field (Terraform without `terraform_version`, a release without a tag, PyPI without a version) are explicit scenarios (`nothingListedCase`, `nothingListedOn`) for released and self-updating tools, knowledge tests for list managers | A "schema drift" fault in the sweep was considered; it would change the sweep for every domain still to migrate. Scenarios keep the change local. |
| D3 | Parsers tested against recorded fixtures and goldens | Inline sample outputs, exported from the case files | Recording is S11 (part 3); the inline samples are the ones the old suites used, so S11 replaces them one for one. |
| D4 | `isSafeNpackdPackageName` and the R-packages allowlist move to `security/package-id-allowlists` | Stay in `os/npackd.test.ts` and `lang-other/r-packages.test.ts` | That consolidation is S10 (wave 3, `test/e2e-coverage-ci`). |
| D5 | The os-compat "isAvailable false off-platform" tests and the mutual-exclusion tests (pyenv / pyenv-win, nvm / nvm-windows) are deleted or moved | Kept, one per provider, asserting nothing is probed off-platform | The providers still carry their inline platform guards; the platform-gate refactor (wave 3) removes guards and tests together. |
| D6 | No mocks of gup's own helpers | Same, plus `replaceForTest` on faked *boundary* modules | Only for failures the fake does not model because Node never produces them; never on gup modules. |
| D7 | `self`: one scenario per supported platform | One case per target (ten), each on a platform the target exists on | The provider's behaviour differs per target, not per platform; a per-platform case would script every target at once and pin one update argv out of ten. |
| D8 | — | "returns [] when the releases lookup rejects" tests dropped (mint in part 1; xcodes, swiftly, pyenv and nvm in part 2) | The real `fetchGitHubReleaseLatest` resolves null on every failure; only a mock could reject. The provider-level behaviour (lookup fails, no row) is the sweep's. |

## 5. Results

| | Part 1 | Part 2 |
|---|---:|---:|
| Flat files deleted | 12 | 10 |
| Test lines deleted / added | 7,541 / 5,489 | 7,401 / 4,596 |
| Executed tests before → after | 692 → 984 | 687 → 1,163 |
| of which generated / hand-written | 570 / 414 | 952 / 211 |
| Shared support and self-tests added | 1,049 lines | 139 lines, 4 tests |

- **Coverage (R2):** no `src` file of the migrated sets lost more than the tolerance; the only
  drop in all of `src/` is still `lang-other/mint.ts` lines −0.73 (part 1: a `catch` only a
  mocked `fetchGitHubReleaseLatest` could reach). Gains: iac `boundary.ts` 92.85 → 100
  branches, os `choco.ts` 93.75 → 100, `scoop.ts` 90.90 → 95.45, `mas.ts` 87.50 → 93.75,
  `macports.ts` 86.66 → 93.33 (part 1); `uv-tools.ts` 92.30 → 96.15 and `yarn-global.ts`
  90 → 95 branches, `self.ts` 95.72 → 100 lines (part 2, Homebrew was untested).
- **Mutations (R3):** part 1, nine caught (one needed a stronger test first: the `dotnet
  --list-sdks` banner now holds digits); part 2, 28 caught out of 29 applied. The one that
  passed relaxes the self provider's version parser to two components, which is the fix of a
  finding below, not a regression; a breaking regex mutation of the same parser was caught.
- **New coverage of real behaviour:** scoop's id validation before its shell-routed spawn,
  winget keeping the rows it printed before a non-zero exit, Chocolatey's reboot advisory on
  `updateAll` itself, every batch argv, the `requiresAdmin` rows (Chocolatey, Npackd, the .NET
  SDK and pyenv from apt), the measured `slow` flag of every per-row fetcher, nvm's directory
  passed through the environment, Homebrew's self-update.

## 6. Findings in `src` (not fixed here: provider sources belong to other branches)

- **winget pins.** `getPinnedIds` keys a pin by the second whitespace-separated token of each
  `winget pin list` line, but that output starts with a Name column that can contain spaces:
  a pinned package named "Node.js LTS" is recorded as `LTS`, loses its "pinned" note, and
  could mark an unrelated id. The contract case uses a one-word name on purpose.
- **cargo.** The parser skips the line after the header (a separator cargo-update does not
  print) and reads name, *an ignored column*, current and latest, while cargo-update prints
  `Package Installed Latest Needs update`: on real output it takes `Latest` for current and
  `Yes`/`No` for latest, which the version check rejects. Nothing is ever listed. The case
  feeds the layout the parser reads.
- **rustup.** The toolchain regex stops at the first `-` after the version, and real
  `rustup check` lines carry a dated commit (`(129f3b996 2024-06-10)`): toolchain updates are
  never listed, only rustup's own. The case writes the dates without dashes.
- **composer-self.** It reads `package.versions` from `repo.packagist.org/p2/…`, an endpoint
  whose Composer 2 metadata format lists versions under `packages.<name>`. The cases pin the
  shape the provider reads.
- **asdf.** The scan tests the legacy marker (`v0.`) on a version it already stripped of its
  `v`, so a legacy clone, which `update()` upgrades with `asdf update`, is listed as a binary
  to reinstall and flagged `manual`.
- **yarn-global.** The global list parser wants a name that does not start with `@`: scoped
  global packages are never listed.
- **self (pip).** The targets' version parser needs three components; pip's own versions are
  often two (`pip 24.2 from …`), so pip's self-update is never listed.
- **julia-pkg (to verify on a real Julia, S11).** The parser anchors on a leading `[uuid]`,
  while `Pkg.status(outdated=true)` documents `⌃`/`⌅` markers before it on upgradable
  packages.
- **Unreachable catches.** `existsSync` never throws in Node, and `fetchGitHubReleaseLatest`
  never rejects; the `try/catch` around them in msys2, Cygwin, Nix, Sparkle and mint are
  defensive. They are still exercised (through `replaceForTest`) except mint's.
- **scoop ids.** `isSafeScoopPackageId` accepts `..` as a bucket (`../x`); it carries no shell
  metacharacter, so it is not an injection, but scoop would read it as a bucket name.

## 7. For the next domains (part 3)

- Left as flat files: `cloud`, `containers`, `dev-cli`, `security`, `kubernetes`,
  `editor-plugins`, `embedded-mobile` (joining `embedded-mobile/`), `shell`, `wsl`,
  `win-ide-shell-gaps`, the jetbrains trio, `ide-ext` and `vscode-like`. `ide-manual.test.ts`
  is not migrated (amendment W2-8).
- Write the cases first and run `contract.test.ts` alone; most generic old tests disappear
  into it. Then port what is left as knowledge, on `system.load(...)`.
- A provider that delegates its upgrade: `routes: delegationRoutes(binary, { ids,
  manualMessage })`; a released single binary: `releasedToolCases(...)`; a tool that
  upgrades itself: `selfUpdatingToolCases(...)`.
- Check each commit with `coverage-delta.mjs --scope src/providers/<domain>/` and the whole of
  `src/` at tolerance 0, and seed three mutations.
- When the last flat file is gone, delete the `providers-legacy` project from
  `vitest.config.ts` (X-1) and update the `tests/providers/winget.test.ts` row of
  `tests/support/self-test/project-membership.test.ts`, which still expects that project.
