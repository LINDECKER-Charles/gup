# Design note — provider test migration (`test/provider-contracts`)

Branch `test/provider-contracts` (wave 2), testing spec steps S4 (pilot), S7 and the
`pkg-gaps` part of S8, under the migration safety rules R1–R4. This note covers part 1 of
the branch: the `iac` pilot, the whole `os` domain and the four providers `pkg-gaps.test.ts`
held for `lang-other` and `dotnet-php`. The other domains, the fixture recorder (S11) and the
removal of the `providers-legacy` project (amendment X-1) follow on the same branch.

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

- `os` splits its cases by family, `windows.cases.ts` (winget, scoop, choco, MSYS2, Cygwin,
  Npackd) and `posix.cases.ts` (Homebrew formulae and casks, mas, MacPorts, Nix, Sparkle,
  Fink, pkgin, pkgx): fifteen providers in one file would pass 900 lines.
- `iac` keeps the spec's two files (`iac.cases.ts`, `hashicorp.cases.ts`).
- `lang-other` and `dotnet-php` start their `<domain>.cases.ts` with the providers that came
  out of `pkg-gaps` (vcpkg, mint; .NET SDK, NuGet); their remaining providers join the same
  files when those domains migrate. The gem provider's Apple-system-Ruby guard, which lived in
  `macos.test.ts`, already sits in `lang-other/gem.test.ts`.
- A case file exports its cases array, and only the machines and sample outputs a knowledge
  test of the domain starts from.

What goes where, as applied:

| Old test | New home |
|---|---|
| detection, "returns [] when the probe/API fails", "current == latest", updateAll empty / shape / bulk failure, update failure | generated contract tests (§2) |
| exact rows of a nominal scan, notes, `requiresAdmin`, install argv, batch argv | the case data (`outdated`, `update`, `batchInstalls`, `routes`) |
| parsers, multi-step updates, safety rules, fallbacks, platform guards, odd environments | `<provider-id>.test.ts`, on the fake machine |
| `expect(mock).toHaveBeenCalledWith(...)` side assertions | dropped (R1 reason 2): the strict machine fails on any unscripted spawn or request, and the trace carries what was spawned, read and fetched |

## 2. Harness extensions

All additive (amendment rule: no existing member changes meaning); each has self-tests under
`tests/support/self-test/`.

| Extension | Where | Why |
|---|---|---|
| `ProviderContractCase.routes` (`UpdateRoute`) and the generated test "routes the update to the installer that owns the binary" | `contract/types.ts`, `contract/checks.ts` | About fifty providers hand their upgrade to whichever installer owns the binary. One test per case checks the argv every installer receives through the real `install-source`, instead of a `delegateUpdate` mock's arguments. Route violations count for the dead-waiver check. |
| `installedVia`, `upgradeArgv`, `delegationRoutes(binary, delegation, extra?)` | `contract/installers.ts` | Machines where scoop, winget, choco, brew, apt (dpkg), dnf (rpm) or nobody owns a binary, and each installer's upgrade argv stated literally; a route per installer from a provider's ids. |
| `releasedToolCases`, `nothingListedCase` | `contract/released-tool.ts` | The commonest provider shape (a binary, a release API, a delegated upgrade) as three scenarios: scoop + routes, manual install, up to date. |
| `githubLatest`, `hashicorpLatest` | `system/releases.ts` | Release API routes with the minimal real payload. |
| `ProviderContractCase.batchInstalls` and the generated test "reports a failed updateAll as failed outcomes" | `contract/*` | Batch commands (`brew upgrade --formula`, `choco upgrade all -y`…) are pinned in the case, and a batch whose installs all fail may not report a success (every shape but `skipped`). |
| `CommandScript.afterInstall` | `system/*` | The answer once an install has run: pkgin and MSYS2 re-query after their upgrade. |
| `SpawnRecord.timeout` | `system/fake-runner.ts` | Pins the wall-clock cap a scan asks the runner for (Fink, pkgin). |
| `HttpRoute.finalUrl` | `system/*` | `Response.url` after redirects: Sparkle refuses a chain that left TLS. |
| `installs()`, `installArgvs()`, `probeArgvs()` | `system/trace.ts` | Readers of the trace for knowledge tests. |
| `replaceForTest(module, name, implementation)` | `system/boundary-spy.ts` | A spy on a faked boundary module for one test, restored after it: for the failures Node never produces on its own but providers guard against (`existsSync` throwing, `homedir()` without a passwd entry, an elevation probe that rejects). |

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
  try/catch), applied to `src`, run against the domain's tests, reverted. Results are in the
  commit bodies and §5.
- **R4 same-commit swap.** Each flat file is deleted in the commit that adds its replacement.

## 4. Deviations from the testing spec

| # | Spec | Shipped | Why |
|---|---|---|---|
| D1 | One scenario per package manager a delegating provider maps | One case per provider with `routes` (one generated test covering every installer) | Same assertions (real argv per installer), without multiplying every generated test and fault sweep by five. |
| D2 | — | Valid answers missing the expected field (Terraform without `terraform_version`, a release without a tag) are explicit `nothingListedCase` scenarios | A "schema drift" fault in the sweep was considered; it would change the sweep for every domain still to migrate. Scenarios keep the change local. |
| D3 | Parsers tested against recorded fixtures and goldens | Inline sample outputs, exported from the case files | Recording is S11 (the recorder lands later on this branch); the inline samples are the ones the old suites used, so S11 replaces them one for one. |
| D4 | `isSafeNpackdPackageName` moves to `security/package-id-allowlists` | Stays in `os/npackd.test.ts` | That consolidation is S10 (wave 3, `test/e2e-coverage-ci`). |
| D5 | The os-compat "isAvailable false off-platform" tests are deleted | Kept, one per provider, asserting nothing is probed off-platform | The providers still carry their inline platform guards; the platform-gate refactor (wave 3) removes guards and tests together. |
| D6 | No mocks of gup's own helpers | Same, plus `replaceForTest` on faked *boundary* modules | Only for failures the fake does not model because Node never produces them; never on gup modules. |

## 5. Results (part 1)

| | Before (flat files) | After |
|---|---:|---:|
| Test files | 12 | 23 (4 contract, 19 knowledge) |
| Lines (tests) | 7,541 | 5,489, plus 1,049 lines of shared support and self-tests |
| Executed tests | 692 | 984 (570 generated from 62 cases, 414 hand-written) |

- **Coverage (R2):** no `src` file of the migrated sets lost branch or line coverage, except
  `lang-other/mint.ts` lines −0.73 (a `catch` only a mocked `fetchGitHubReleaseLatest` could
  reach); several gained (iac `boundary.ts` 92.85 → 100 branches, os `choco.ts` 93.75 → 100,
  `scoop.ts` 90.90 → 95.45, `mas.ts` 87.50 → 93.75, `macports.ts` 86.66 → 93.33). No file of
  `src/` outside them moved.
- **Mutations (R3):** all nine caught. One needed a stronger test first: unanchoring the
  `dotnet --list-sdks` regex passed the old suite too, whose banner lines held no digits; the
  test now includes the first-run banner (`Welcome to .NET 8.0!`).
- **New coverage of real behaviour:** scoop's id validation before its shell-routed spawn
  (untested before), winget keeping the rows it printed before a non-zero exit, Chocolatey's
  reboot advisory checked on `updateAll` itself (the old test re-implemented the mapping),
  Chocolatey and Npackd `requiresAdmin` rows, every batch argv, the Sparkle slow flag.

## 6. Findings in `src` (not fixed here: provider sources belong to other branches)

- **winget pins.** `getPinnedIds` keys a pin by the second whitespace-separated token of each
  `winget pin list` line, but that output starts with a Name column that can contain spaces:
  a pinned package named "Node.js LTS" is recorded as `LTS`, loses its "pinned" note, and
  could mark an unrelated id. The contract case uses a one-word name on purpose.
- **Unreachable catches.** `existsSync` never throws in Node, and `fetchGitHubReleaseLatest`
  never rejects; the `try/catch` around them in msys2, Cygwin, Nix, Sparkle and mint are
  defensive. They are still exercised (through `replaceForTest`) except mint's.
- **scoop ids.** `isSafeScoopPackageId` accepts `..` as a bucket (`../x`); it carries no shell
  metacharacter, so it is not an injection, but scoop would read it as a bucket name.

## 7. For the next domains

- Write the cases first and run `contract.test.ts` alone; most generic old tests disappear
  into it. Then port what is left as knowledge, on `system.load(...)`.
- A provider that delegates its upgrade: `routes: delegationRoutes(binary, { ids,
  manualMessage })`; a released single binary: `releasedToolCases(...)`.
- Check each commit with `coverage-delta.mjs --scope src/providers/<domain>/` and the whole of
  `src/` at tolerance 0, and seed three mutations.
- When the last flat file is gone, delete the `providers-legacy` project from
  `vitest.config.ts` (X-1) and update the `tests/providers/winget.test.ts` row of
  `tests/support/self-test/project-membership.test.ts`, which still expects that project.
