# Fragment — `test/e2e-coverage-ci`

Test suite and tooling only: no change to what gup does. Design note:
[`docs/development/design/e2e-coverage-ci.md`](../../development/design/e2e-coverage-ci.md).

## Internal

- **core:** Merge the three install-source suites into one table faked at the process and `realpath` boundaries, and the three registry suites into one, the ownership exclusion now running the real filter over a faked `where` ([`9f9143f`](https://github.com/LINDECKER-Charles/gup/commit/9f9143f), [`0a0691c`](https://github.com/LINDECKER-Charles/gup/commit/0a0691c))
- **core:** Mirror `src/core/history` in its tests, keeping only what the shard location adds to the shared state directories ([`45049cf`](https://github.com/LINDECKER-Charles/gup/commit/45049cf))
- **core:** Pin argv hardening in one security suite, on both spawn paths: the runner's own and the embedded terminal's trampoline ([`c1a3e68`](https://github.com/LINDECKER-Charles/gup/commit/c1a3e68))
- **core:** Run the retry-consent suite with the security tests ([`35ec79c`](https://github.com/LINDECKER-Charles/gup/commit/35ec79c))
- **providers:** Gather every package-id allowlist and PowerShell literal escape in the security suite, on the fake machine — Rancher Desktop's exe path pinned for the first time ([`ed9345c`](https://github.com/LINDECKER-Charles/gup/commit/ed9345c))
- **ui, cli:** Cover `gup list`'s scan table, assert what `gup list` prints and records instead of which mock it called, and open the package picker for real from `promptPackageSelection` ([`7bee682`](https://github.com/LINDECKER-Charles/gup/commit/7bee682), [`ff7faab`](https://github.com/LINDECKER-Charles/gup/commit/ff7faab), [`eb959a2`](https://github.com/LINDECKER-Charles/gup/commit/eb959a2))
- **core, cli, ui:** Switch `process.platform` through the shared test helper in every suite ([`6d724ba`](https://github.com/LINDECKER-Charles/gup/commit/6d724ba), [`e6d9042`](https://github.com/LINDECKER-Charles/gup/commit/e6d9042), [`2cbda68`](https://github.com/LINDECKER-Charles/gup/commit/2cbda68))
- **ui:** Extend the contrast audit to every view of the menu — the Journal, Planification, the JOURNAL options and the in-menu update, its embedded terminal held to the terminal's own background — and record the light-terminal finding below ([`a5fbfe8`](https://github.com/LINDECKER-Charles/gup/commit/a5fbfe8))
- **providers:** Replay every contract case on each other OS its provider supports, and every registered provider on a machine where everything answers, on each OS it supports; require a contract case for every registered provider ([`b537fdd`](https://github.com/LINDECKER-Charles/gup/commit/b537fdd))
- **lint:** Replace the global 90 % coverage gate with floors on the safety-critical modules, and report coverage for the whole of `src` again, UI included ([`5808124`](https://github.com/LINDECKER-Charles/gup/commit/5808124))
- **chore:** Run the typecheck in `check.cmd` ([`e99a3a3`](https://github.com/LINDECKER-Charles/gup/commit/e99a3a3))

## Known issue found

- The run view's embedded terminal draws an installer's default-coloured output, and gup's notes
  there, in white rather than the terminal's foreground: unreadable on a light terminal
  (Terminal.app's Basic profile). Pinned as an expected failure in the contrast audit until the
  pane follows the terminal's foreground.
