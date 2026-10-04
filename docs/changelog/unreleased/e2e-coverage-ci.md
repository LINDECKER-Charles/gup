# Fragment — `test/e2e-coverage-ci`

Test suite and tooling only: no change to what gup does. Design note:
[`docs/development/design/e2e-coverage-ci.md`](../../development/design/e2e-coverage-ci.md).

## CI

- **ci:** Run the end-to-end smoke on every leg of the required `test` job (names and matrix unchanged), the tests with `GUP_MUTATE=1` on the throw-away runners (the sandboxed Task Scheduler round trip on Windows), and on Linux the coverage run that enforces the floors, its report kept as an artifact ([`0bff5f3`](https://github.com/LINDECKER-Charles/gup/commit/0bff5f3))
- **ci:** Install the packed tarball with `npm i -g --ignore-scripts` on Windows and macOS, then require `gup doctor` to find the embedded terminal (amendment X-4) ([`d16eaaa`](https://github.com/LINDECKER-Charles/gup/commit/d16eaaa))
- **e2e:** Add the weekly real-machine workflow — the full end-to-end suites on macOS and Windows runners, mutating ones included, and the provider fixtures recorded on macOS and Linux for review; also on demand and on pull requests labelled `e2e-full` ([`859bbc3`](https://github.com/LINDECKER-Charles/gup/commit/859bbc3))

## Documentation

- **docs:** Document the test strategy in `docs/development/testing.md` (pyramid, commands per shell, where a test goes, the end-to-end suites, CI, coverage), add the Windows and macOS manual checklists, and bring CONTRIBUTING, the architecture and how-gup-works pages and the pull request template up to date ([`955370b`](https://github.com/LINDECKER-Charles/gup/commit/955370b))

## Internal

- **core:** Merge the three install-source suites into one table faked at the process and `realpath` boundaries, and the three registry suites into one, the ownership exclusion now running the real filter over a faked `where` ([`9f9143f`](https://github.com/LINDECKER-Charles/gup/commit/9f9143f), [`0a0691c`](https://github.com/LINDECKER-Charles/gup/commit/0a0691c))
- **core:** Mirror `src/core/history` in its tests, keeping only what the shard location adds to the shared state directories ([`45049cf`](https://github.com/LINDECKER-Charles/gup/commit/45049cf))
- **core:** Pin argv hardening in one security suite, on both spawn paths: the runner's own and the embedded terminal's trampoline ([`c1a3e68`](https://github.com/LINDECKER-Charles/gup/commit/c1a3e68))
- **core:** Run the retry-consent suite with the security tests ([`35ec79c`](https://github.com/LINDECKER-Charles/gup/commit/35ec79c))
- **providers:** Gather every package-id allowlist and PowerShell literal escape in the security suite, on the fake machine — Rancher Desktop's exe path pinned for the first time ([`ed9345c`](https://github.com/LINDECKER-Charles/gup/commit/ed9345c))
- **ui, cli:** Cover `gup list`'s scan table, assert what `gup list` prints and records instead of which mock it called, and open the package picker for real from `promptPackageSelection` ([`7bee682`](https://github.com/LINDECKER-Charles/gup/commit/7bee682), [`ff7faab`](https://github.com/LINDECKER-Charles/gup/commit/ff7faab), [`eb959a2`](https://github.com/LINDECKER-Charles/gup/commit/eb959a2))
- **cli:** Pin `gup doctor` over the real detection with a probe that throws and one that never answers: both listed as missing, exit 0 ([`09a9968`](https://github.com/LINDECKER-Charles/gup/commit/09a9968))
- **core, cli, ui:** Switch `process.platform` through the shared test helper in every suite ([`6d724ba`](https://github.com/LINDECKER-Charles/gup/commit/6d724ba), [`e6d9042`](https://github.com/LINDECKER-Charles/gup/commit/e6d9042), [`2cbda68`](https://github.com/LINDECKER-Charles/gup/commit/2cbda68))
- **ui:** Extend the contrast audit to every view of the menu — the Journal, Planification, the JOURNAL options and the in-menu update, its embedded terminal held to the terminal's own background — and record the light-terminal finding below ([`a5fbfe8`](https://github.com/LINDECKER-Charles/gup/commit/a5fbfe8))
- **providers:** Replay every contract case on each other OS its provider supports, and every registered provider on a machine where everything answers, on each OS it supports; require a contract case for every registered provider ([`b537fdd`](https://github.com/LINDECKER-Charles/gup/commit/b537fdd))
- **lint:** Replace the global 90 % coverage gate with floors on the safety-critical modules, and report coverage for the whole of `src` again, UI included ([`5808124`](https://github.com/LINDECKER-Charles/gup/commit/5808124))
- **chore:** Run the typecheck in `check.cmd` ([`e99a3a3`](https://github.com/LINDECKER-Charles/gup/commit/e99a3a3))
- **cli:** Add the real-machine end-to-end suites and their toolkit: the built CLI in a sandbox, the menu in a real pseudo-terminal read with a headless xterm, real providers scanned for drift, and — with `GUP_MUTATE=1` — `is-number` updated in a throw-away npm prefix through `gup update`, the run view, `schedule run-now` and a `gup-it-<random>` Task Scheduler tick ([`a4ed3bd`](https://github.com/LINDECKER-Charles/gup/commit/a4ed3bd))
- **core/pty:** Time the ConPTY fast exit against node-pty's own exit event instead of a 500 ms budget a busy machine overran ([`0ca6a75`](https://github.com/LINDECKER-Charles/gup/commit/0ca6a75))
- **lint:** Drop the developer's `NO_COLOR`, `FORCE_COLOR` and `GUP_*` variables in every test worker: a `NO_COLOR=1` shell turned three theme suites red ([`3e2c810`](https://github.com/LINDECKER-Charles/gup/commit/3e2c810))
- **chore:** Run every gate, then the end-to-end smoke alone, in `check.cmd` ([`cfc5754`](https://github.com/LINDECKER-Charles/gup/commit/cfc5754))

## Known issues found

- The run view's embedded terminal draws an installer's default-coloured output, and gup's notes
  there, in white rather than the terminal's foreground: unreadable on a light terminal
  (Terminal.app's Basic profile). Pinned as an expected failure in the contrast audit until the
  pane follows the terminal's foreground.
- `gup update provider:package` updates without a scan, so its history record carries no `from`
  and `to` (the menu's does); the end-to-end suite asserts what ships.
- Unit suites leave `mkdtemp` directories behind in the temp folder (`gup-config-*`,
  `gup-elevation-test-*`, `gup-batch-*`…), thousands after the 0.5.0 waves' runs.
