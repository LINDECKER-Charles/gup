# local-update-failures

## Fixed

- **providers/os:** a winget package whose installer refuses to run as administrator ends as a
  skip that says what to run, no longer as a failure offered for retry. winget answers
  `0x8A150056` (`INSTALLER_PROHIBITS_ELEVATION`) when the manifest forbids an elevated installer
  and its own process is elevated: Spotify failed this way at every run since October. Every retry
  tier runs in the same context, and the reinstall tier uninstalls the application before an
  install winget then refuses. The skip says to run `winget upgrade --id <id>` from a terminal
  that is not elevated (`fix(providers/os): end winget's refusal to install elevated as a skip`)
- **core:** Git for Windows, semgrep, npm, pip and pnpm are no longer updated twice in one run.
  Each had two rows in the same scan, and the second update failed or did nothing: winget's
  `Git.Git` met the installer the `git-for-windows` provider had left running in the background;
  the `semgrep` provider skipped with "host Python not found" for a semgrep installed as a uv
  tool, which the `uv-tools` row updated; `self`'s `pnpm`, run after `pnpm-g`'s, found the version
  `pnpm-g` had just installed and failed with "still on PATH"; `self`'s `npm` and `pip` repeated
  `npm-g`'s and `pip`'s upgrade. When both providers list the software, `Git.Git` now gives way
  to `git-for-windows`, `semgrep` to `uv-tools` or `pipx`, `self`'s `npm` and `pip` to `npm-g` and
  `pip`, and `pnpm-g`'s `pnpm` to `self`'s, which checks that the `pnpm` on `PATH` changed
  (`fix(core): stop updating Git, semgrep, npm, pip and pnpm twice`)

## Documentation

- **docs:** the troubleshooting guide covers the elevation refusal among winget's final failures,
  and lists every pair of rows that give way to one another
  (`fix(providers/os): end winget's refusal to install elevated as a skip`,
  `fix(core): stop updating Git, semgrep, npm, pip and pnpm twice`)
