# Design note — provider test migration (`test/provider-contracts`)

Branch `test/provider-contracts` (wave 2), testing spec steps S4 (pilot), S5 to S8 and S11,
under the migration safety rules R1–R4, plus amendment X-1. The branch landed in three parts:

| Part | Domains migrated |
|---|---|
| 1 | the `iac` pilot, the whole `os` domain, and `pkg-gaps.test.ts` split into `lang-other` and `dotnet-php` |
| 2 | `rust`, `jvm`, `dotnet-php`, `lang-other`, `toolchain` (with `toolchain-gaps.test.ts` split into `embedded-mobile`, `toolchain`, `python` and `node`), `python`, `node`, and the `self` pair |
| 3 | `editor-plugins`, `ide` (the VS Code family and the JetBrains trio), `dev-cli`, `shell`, `win-ide-shell-gaps.test.ts` split into `ide`, `shell` and `dev-cli`, `wsl`, `containers`, `security`, `kubernetes`, `cloud`, `embedded-mobile`; the `providers-legacy` project retired (X-1); the fixture recorder and nine providers on recorded Windows output (S11) |

Read with: [`test-harness.md`](test-harness.md) (the fake machine and the contract harness
this branch builds on) and the testing spec (`specs/testing.md`, §5.5, §5.6, §5.9 and §11).

---

## 1. What a migrated domain looks like

```
tests/providers/<domain>/
  <domain>.cases.ts      contract cases: pure data + factories, no vitest import
  recorded.cases.ts      cases whose probe output is a recorded fixture (S11, §7)
  contract.test.ts       defineProviderContract({ domain, cases })
  <provider-id>.test.ts  knowledge tests only, on the fake machine
  __golden__/*.json      the rows of the fixture-backed cases
tests/fixtures/providers/<domain>/<provider-id>/
  <probe>.<platform>.<ext>   recorded output, as gup receives it
  _manifest.json             where, when and how each file was recorded
```

Every provider test now lives in a domain folder and runs in the `providers` project, on the
fake machine. The `providers-legacy` project is gone (§4, D9).

- A domain whose cases would pass about 500 lines splits them by family, and its
  `contract.test.ts` runs every file: `os` (`windows.cases.ts`, `posix.cases.ts`), `iac`,
  `dotnet-php`, `lang-other`, `node`, `ide` (`vscode-like`, `jetbrains`, `visual-studio`),
  `dev-cli` (`dev-cli`, `git-for-windows`), `shell` (`shell`, `psresource`), `wsl` (`wsl`,
  `distros`), `kubernetes` (`kubernetes`, `plugins`), `cloud` (`cloud`, `self-updating`) and
  `embedded-mobile` (`embedded-mobile` for xcodes, `sdks`).
- `self/` holds the meta-provider of the package managers' own updates (`src/providers/self.ts`).
- A case file exports its cases array, and only the machines and sample outputs a knowledge
  test of the domain starts from. Knowledge files are named after the provider's source file,
  except where several providers share one rule (§4, D10): `containers/desktop-apps`,
  `wsl/distro-providers`, `cloud/pip-clis`, `cloud/banners`.

What goes where, as applied:

| Old test | New home |
|---|---|
| detection, "returns [] when the probe/API fails", "current == latest", updateAll empty / shape / bulk failure, update failure | generated contract tests (§2) |
| exact rows of a nominal scan, notes, `requiresAdmin`, install argv, batch argv | the case data (`outdated`, `update`, `batchInstalls`, `routes`) |
| parsers, multi-step updates, safety rules, fallbacks, platform guards, odd environments | `<provider-id>.test.ts`, on the fake machine |
| `expect(mock).toHaveBeenCalledWith(...)` side assertions | dropped (R1 reason 2): the strict machine fails on any unscripted spawn or request, and the trace carries what was spawned, read and fetched; kept as a trace assertion where the absence is the point ("asks GitHub nothing when…", "never runs `xcodes update`") |

## 2. Harness extensions

Additive except where noted (no existing member changes meaning for an existing case); each
is covered by self-tests under `tests/support/self-test/` or, for the case builders, by every
case built with them.

| Extension | Where | Why |
|---|---|---|
| `ProviderContractCase.routes` (`UpdateRoute`) and the generated test "routes the update to the installer that owns the binary" | `contract/types.ts`, `contract/checks.ts` | About fifty providers hand their upgrade to whichever installer owns the binary. One test per case checks the argv every installer receives through the real `install-source`, instead of a `delegateUpdate` mock's arguments. Route violations count for the dead-waiver check. |
| `installedVia`, `upgradeArgv`, `delegationRoutes(binary, delegation, extra?)` | `contract/installers.ts` | Machines where scoop, winget, choco, brew, apt (dpkg), dnf (rpm) or nobody owns a binary, and each installer's upgrade argv stated literally; a route per installer from a provider's ids. |
| `releasedToolCases`, `nothingListedCase` | `contract/released-tool.ts` | The commonest provider shape (a binary, a release API, a delegated upgrade) as three scenarios: scoop + routes, manual install, up to date. |
| `selfUpdatingToolCases`, `nothingListedOn`, `withRelease` (part 2) | `contract/self-updating-tool.ts` | Its counterpart for a tool that upgrades itself: behind (one row, the self-update collapsed, an optional `onFailure`) and up to date; `nothingListedOn` for a valid answer without the expected field. |
| `githubLatest`, `hashicorpLatest`; `npmLatestRoute`, `pypiRoute` (part 2) | `system/releases.ts` | Release and registry routes with the minimal real payload (the registry ones also as the valid answer that names no version). |
| `ProviderContractCase.batchInstalls` and the generated test "reports a failed updateAll as failed outcomes" | `contract/*` | Batch commands (`brew upgrade --formula`, `choco upgrade all -y`…) are pinned in the case, and a batch whose installs all fail may not report a success (every shape but `skipped`). |
| A collapsed `updateAll` is handed every row twice (part 2, not additive) | `contract/checks.ts` | "One update whatever the row count" cannot be told from per-package with the single row a self-updater lists. |
| A collapsed shape counts the installs of its one update, and an update left to the user counts none (part 2, not additive) | `contract/invariants.ts`, `contract/checks.ts` | nvm's update is two installs, pdtm's too (`-up`, `-ua`); the desktop container apps' is none. |
| `CommandScript.afterInstall` | `system/*` | The answer once an install has run: pkgin and MSYS2 re-query after their upgrade, pnpm compares its version before and after. |
| `SpawnRecord.timeout`, `SpawnRecord.env` (part 2) | `system/fake-runner.ts` | The wall-clock cap a probe asks the runner for (Fink, pkgin, PSResourceGet's 20 s and 3 min); the environment a spawn is handed (nvm's directory, Docker Desktop's exe path). |
| `RequestRecord.body` (part 3) | `system/fake-net.ts` | The text body a request sent: the VS Code Marketplace answers every extension through one POST URL, the extension being named in the query. |
| `HttpRoute.bytes` (part 3) | `system/machine.ts` | A binary body: Nerd Fonts downloads a release zip, which the real adm-zip now extracts on the fake machine (a text body would mangle it). |
| `HttpRoute.finalUrl` | `system/*` | `Response.url` after redirects: Sparkle refuses a chain that left TLS. |
| `installs()`, `installArgvs()`, `probeArgvs()` | `system/trace.ts` | Readers of the trace for knowledge tests. |
| `replaceForTest(module, name, implementation)` | `system/boundary-spy.ts` | A spy on a faked boundary module for one test, restored after it: for the failures Node never produces on its own but providers guard against, and to assert a guard probed nothing. |
| `fixtureTargets`, `parseRecordArgs`, `selectTargets`, `withManifestEntry`, `fixtureText` (part 3) | `fixtures/recording.ts` | The rules of the fixture recorder (§7), self-tested, so the script stays one loop. |
| The `<HOME>` redaction also matches a JSON-escaped home (part 3) | `fixtures/redact.ts` | npm and pip print their install paths in JSON, backslashes doubled. |

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

- **R3 seeded mutations.** Three or more per migrated set (an install argv, a version regex, a
  removed try/catch, or the closest fail-soft guard where a domain has no try/catch), applied
  to `src`, run against the domain's tests, reverted. A mutation counts as caught only when a
  test fails, not when the suite fails to load. Results are in the commit bodies and §5.
- **R4 same-commit swap.** Each flat file is deleted in the commit that adds its replacement.

## 4. Deviations from the testing spec

| # | Spec | Shipped | Why |
|---|---|---|---|
| D1 | One scenario per package manager a delegating provider maps | One case per provider with `routes` (one generated test covering every installer) | Same assertions (real argv per installer), without multiplying every generated test and fault sweep by five. |
| D2 | — | Valid answers missing the expected field (a release without a tag, PyPI or npm without a version…) are explicit scenarios (`nothingListedCase`, `nothingListedOn`) for released and self-updating tools, knowledge tests for list managers | A "schema drift" fault in the sweep would change the sweep for every domain. Scenarios keep the change local. |
| D3 | Parsers tested against recorded fixtures and goldens, for the 27 providers detected on the development machine | Nine providers recorded (§7); the others keep inline samples, the ones the old suites used | The other tools are not installed on this machine, or their output needs a neutralisation pass of its own; S15 records darwin and linux. |
| D4 | `isSafeNpackdPackageName` and the R-packages allowlist move to `security/package-id-allowlists` | Stay in `os/npackd.test.ts` and `lang-other/r-packages.test.ts` | That consolidation is S10 (wave 3, `test/e2e-coverage-ci`). |
| D5 | The os-compat "isAvailable false off-platform" tests and the mutual-exclusion tests are deleted or moved | Kept, one per provider, asserting nothing is probed off-platform | The providers still carry their inline platform guards; the platform-gate refactor (wave 3) removes guards and tests together. |
| D6 | No mocks of gup's own helpers | Same, plus `replaceForTest` on faked *boundary* modules | Only for failures the fake does not model because Node never produces them; never on gup modules. |
| D7 | `self`: one scenario per supported platform | One case per target (ten), each on a platform the target exists on | The provider's behaviour differs per target, not per platform. |
| D8 | — | "returns [] when the releases lookup rejects" tests dropped (mint, xcodes, swiftly, pyenv, nvm) | The real `fetchGitHubReleaseLatest` resolves null on every failure; only a mock could reject. |
| D9 | `ide-manual.test.ts`: not migrated (W2-8); the legacy project deleted at the end (X-1) | The file moved, unchanged but for its import paths, to `tests/providers/ide/ide-manual.test.ts`, where its own `vi.mock`s take precedence over the fake machine | Without the legacy project it would match no vitest project, which the membership self-test refuses. Wave 3 deletes it with the seven providers it tests. |
| D10 | Knowledge files named after a provider source | Four files for a rule several providers share: `containers/desktop-apps`, `wsl/distro-providers`, `cloud/pip-clis`, `cloud/banners` | One table over the providers instead of the same test three to six times. |
| D11 | — | gcloud's case carries an `outcome-id` waiver | `update(row.id)` answers for `gcloud` whatever component it is handed (§6); the waiver's dead check fails the day the provider is fixed. |
| D12 | Fixtures "committed neutralised" | The recorder writes redacted output; the package names are neutralised by hand afterwards, noted in the manifest (`neutralised`) | Which cells are personal depends on each tool's format; a re-recording drops the note, so a raw file is visible in review. |

## 5. Results

| | Part 1 | Part 2 | Part 3 | Whole branch |
|---|---:|---:|---:|---:|
| Flat files deleted | 12 | 10 | 15 | 37 |
| Test lines deleted / added | 7,541 / 5,489 | 7,401 / 4,596 | 10,095 / 5,758 | 25,037 / 16,150 * |
| Executed tests before → after | 692 → 984 | 687 → 1,163 | 1,045 → 1,981 | 2,424 → 4,216 * |
| of which generated / hand-written | 570 / 414 | 952 / 211 | 1,682 / 299 | 3,286 / 930 * |
| Shared support and self-tests added | 1,049 lines | 139 lines, 4 tests | 470 lines, 14 tests | 1,658 lines |
| Seeded mutations caught / applied | 9 / 9 | 28 / 29 | 46 / 47 | 83 / 85 |

\* Measured at the head of the branch: every `tests/providers/**/*.ts` file but
`ide/ide-manual.test.ts` (2,092 lines, 135 tests, kept as is, D9), including the S11 recorded
scenarios (9 cases, 88 tests, 12 fixture files and 9 goldens).

- **Coverage (R2):** no `src` file lost more than the tolerance; the only drop in all of
  `src/` at tolerance 0 is still `lang-other/mint.ts` lines −0.73 (part 1: a `catch` only a
  mocked `fetchGitHubReleaseLatest` could reach). Gains: iac `boundary.ts` 92.85 → 100
  branches, os `choco.ts` 93.75 → 100, `scoop.ts` 90.90 → 95.45, `mas.ts` 87.50 → 93.75,
  `macports.ts` 86.66 → 93.33 (part 1); `uv-tools.ts` 92.30 → 96.15, `yarn-global.ts` 90 →
  95, `self.ts` 95.72 → 100 lines (part 2); `jetbrains.ts` 95.61 → 96.49 branches and 98.43 →
  100 lines, `semgrep.ts` 91.66 → 100 branches (part 3: its POSIX interpreter lookup only ran
  on a Windows host before).
- **Mutations (R3):** part 2's miss relaxes the self provider's version parser, which is the
  fix of a finding; part 3's is a first Lazygit variant (a leading space in the pattern) that
  the sample banner still matched, replaced by a breaking one.
- **New coverage of real behaviour:** scoop's id validation before its shell-routed spawn,
  winget keeping the rows it printed before a non-zero exit, every batch argv, the
  `requiresAdmin` rows, the measured `slow` flag of every per-row fetcher, nvm's directory and
  Docker Desktop's exe path passed through the environment, the Marketplace query naming the
  extension, Nerd Fonts' real zip extraction and lockfile, the Semgrep and Visual Studio
  updates on every host OS, and nine parsers on recorded Windows output (§7).

## 6. Findings in `src` (not fixed here: provider sources belong to other branches)

Confirmed on recorded output (§7):

- **scoop.** Real `scoop status` pads the Name column to the longest name plus one space, and
  the row parser splits on two spaces or more: the longest name's row never splits, so a single
  outdated app is never listed (the recorded golden is `[]`).
- **rustup.** The toolchain regex stops at the first `-` after the version, and real `rustup
  check` lines carry a dated commit (`(48a229cea 2026-09-01)`): toolchain updates are never
  listed, only rustup's own (recorded golden: `[]`, a toolchain being behind).
- **wsl.** A French `wsl --version` reads `Version WSL : 2.7.13.0`; the English-only regex finds
  nothing, so WSL is never listed on a French Windows (recorded golden: `[]`).
- **winget.** An unknown installed version is printed `Unknown`; the provider compares with
  `unknown`, so the row never carries its "unknown version" note.

From the migration:

- **gcloud.** `update(packageId)` returns the id `gcloud` whatever component row it is given;
  only `updateAll` maps outcomes to rows (D11).
- **winget pins.** `getPinnedIds` keys a pin by the second whitespace-separated token of each
  `winget pin list` line, while the Name column can contain spaces.
- **cargo.** The parser reads cargo-update's table one column off and skips its first row:
  nothing is ever listed. The case feeds the layout the parser reads.
- **composer-self.** It reads `package.versions` from a Composer 2 metadata endpoint that lists
  versions under `packages.<name>`.
- **asdf.** A legacy clone is flagged `manual` with the "binary" note, although its update works.
- **yarn-global.** Scoped global packages are never listed.
- **self (pip).** The targets' version parser needs three components; pip's own are often two.
- **JetBrains.** Chocolatey installs the IDEs under Program Files, which the scan classifies as
  manual: the `choco` branch of `detectSourceFromPath` is unreachable from a scan.
- **helm-repo.** `listOutdated` alone, on a JSON object rather than a list, would emit
  `undefined repo(s)`; `isAvailable` refuses that output first, so the registry never gets there.
- **Unreachable catches.** `existsSync` never throws in Node, and `fetchGitHubReleaseLatest`
  never rejects; the `try/catch` around them in msys2, Cygwin, Nix, Sparkle and mint are
  defensive.
- **scoop ids.** `isSafeScoopPackageId` accepts `..` as a bucket (`../x`): not an injection, but
  scoop would read it as a bucket name.

To verify on the real tool (S15):

- **glab** asks `profclems/glab` for its latest release, a repository GitLab's CLI left for
  gitlab.com in 2022; the provider lists any different version, an older one included.
- **arduino-cli.** `arduino-cli upgrade` upgrades cores and libraries, not the CLI, yet it is the
  update of the CLI's own row; arduino-cli 1.x may also have renamed the `outdated` JSON keys.
- **expo** compares `expo --version` with the npm `expo` package, whose version is the SDK's.
- **krew.** Piped, `kubectl krew list` may print names only, without the PLUGIN/VERSION table.
- **nuclei-templates.** `nuclei -version` may not print a templates version line.
- **JetBrains on macOS.** Current Homebrew casks move the bundle into /Applications instead of
  linking it from the Caskroom, which the scan would classify as manual.
- **julia-pkg.** The parser anchors on a leading `[uuid]`, while `Pkg.status(outdated=true)`
  documents `⌃`/`⌅` markers before it.

## 7. Recorded fixtures (S11)

```bash
npm run fixtures:record -- --provider winget pip      # or --domain wsl, or --all
npm run fixtures:record -- --all --dry-run             # the argv it would run, nothing spawned
```

- The recorder (`scripts/fixtures/record.ts`, run with `tsx`) loads every `*.cases.ts`, keeps the
  cases simulated on the host's platform, and runs each probe whose output is a `fixture(...)`
  and whose binary is installed, through gup's real `run()`. It never reads an `update`, a
  route or a batch: it runs nothing `gup list` would not run.
- Each output is redacted (`<USER>`, `<HOST>`, `<HOME>`, the JSON-escaped home included) and
  secret-scanned before anything is written; a hit aborts the run. A fixture holds what gup
  received plus the final newline the fake runner strips again. Exit codes are case data.
- `_manifest.json` lists, per file, the argv, OS, date, gup commit and redaction counts.
- **Neutralise before committing**: the repository is public, and lists of installed packages
  are personal. Replace package names and ids (same length where a cell fills its column),
  keep versions, layout, encodings and messages, and record what was done in the entry's
  `neutralised` note. Then create or update the goldens with `vitest run -u
  tests/providers/<domain>` and review their diff.
- Recorded so far, on a French Windows 11: winget (`upgrade`, `pin list`), scoop, pip, npm,
  rustup, kubectl, the .NET SDK, Git for Windows (`--version`, the updater's help on stderr)
  and WSL (`--version`, `-l -q`, both UTF-16). The other detected providers, and darwin and
  linux, are S15's.
