# Fragment — `feat/shared-foundation`

The extension points the 0.5.0 features plug into — platforms, state dirs, install output sinks,
a log facade, a settings store, one update pipeline, CLI modules, an appearance seam, a menu view
registry with a pluggable update launcher — plus the behaviour fixes that came with them. Design
note: [`../../development/design/foundation.md`](../../development/design/foundation.md).

## Added

- **ui:** Mark the focused panel with a heavy border, the others staying rounded: which panel has the keyboard no longer depends on colour alone (WCAG 1.4.1) ([`21da4b8`](https://github.com/LINDECKER-Charles/gup/commit/21da4b8))
- **ui:** Draw symbols and borders in ASCII on `GUP_ASCII=1`, `TERM=linux` or `TERM=dumb`, and on macOS/Linux without a UTF-8 locale; every stand-in is one column wide, so layouts do not move ([`7116328`](https://github.com/LINDECKER-Charles/gup/commit/7116328))
- **ui:** `r` rescans from Paquets ([`cf0b908`](https://github.com/LINDECKER-Charles/gup/commit/cf0b908))
- **cli:** `gup doctor` ends with a "Système" section where each part of gup reports its own state ([`71453ef`](https://github.com/LINDECKER-Charles/gup/commit/71453ef))
- **providers/os:** winget runs non-interactive in unattended updates, so a prompt fails fast instead of holding a scheduled run until the install timeout ([`b3a42db`](https://github.com/LINDECKER-Charles/gup/commit/b3a42db), [`df8bada`](https://github.com/LINDECKER-Charles/gup/commit/df8bada))
- **core/history:** History records carry what started the run (`trigger`: menu, cli, schedule), per-provider scan durations and the schedule an update belongs to; the schema version stays 1 ([`d83bce5`](https://github.com/LINDECKER-Charles/gup/commit/d83bce5))

## Changed

- **ui:** After an update, the menu drops the packages it updated instead of rescanning everything (a full scan takes 8 s or more); `r` rescans, and a preference brings the rescan back ([`d536ea5`](https://github.com/LINDECKER-Charles/gup/commit/d536ea5))
- **ui:** The sidebar loses "Tout mettre à jour" and "Cible…": everything is `a` then Entrée in Paquets, a known package stays `gup update provider:packageId` ([`541baad`](https://github.com/LINDECKER-Charles/gup/commit/541baad))
- **core:** A skipped install reads `ignorée par l'utilisateur` everywhere ([`0eb8bcc`](https://github.com/LINDECKER-Charles/gup/commit/0eb8bcc))
- **core/platform:** Providers can declare the platforms gup supports them on; one foreign to the running OS is never probed nor scanned, and `gup update <id>:x` refuses it with the reason ("indisponible sur Windows (macOS uniquement)"). No provider declares one yet ([`80d45ed`](https://github.com/LINDECKER-Charles/gup/commit/80d45ed))

## Fixed

- **cli:** The menu batches administrator packages behind one UAC / `sudo` prompt like `gup update`, instead of trying each Chocolatey (MacPorts, Fink, pkgin…) package without rights ([`34b006a`](https://github.com/LINDECKER-Charles/gup/commit/34b006a), [`0eb8bcc`](https://github.com/LINDECKER-Charles/gup/commit/0eb8bcc))
- **providers:** On macOS and Linux, MacPorts, Fink, pkgin and the apt/dnf delegations go through the elevated batch: one `sudo` password per batch, not one per package mid-run ([`c0e78e3`](https://github.com/LINDECKER-Charles/gup/commit/c0e78e3))
- **core:** Windows exit codes are read as signed 32-bit integers: Visual Studio's "cancelled" and network-failure codes are recognised again ([`5b8cd79`](https://github.com/LINDECKER-Charles/gup/commit/5b8cd79))
- **core:** The wait for the elevated batch is sized to the number of packages, so a long batch is no longer cut off while its window keeps installing ([`4aed1a0`](https://github.com/LINDECKER-Charles/gup/commit/4aed1a0))
- **cli:** `gup doctor` no longer hangs on a wedged probe (`wsl.exe` waiting on a stopped distro): bounded detection, foreign providers never probed ([`71453ef`](https://github.com/LINDECKER-Charles/gup/commit/71453ef))
- **ui:** Closing the console window, Ctrl+Break or a kill while a screen is up gives the terminal back (alternate screen left before raw mode, as conhost needs) and exits with 128 + the signal number ([`d3f37b4`](https://github.com/LINDECKER-Charles/gup/commit/d3f37b4), [`ece1fdc`](https://github.com/LINDECKER-Charles/gup/commit/ece1fdc), [`2d3e4bd`](https://github.com/LINDECKER-Charles/gup/commit/2d3e4bd))
- **ui:** When the menu opens without scanning (scan at launch turned off), Paquets says how to start a scan instead of "Tout est à jour.", and `r` starts it ([`a322697`](https://github.com/LINDECKER-Charles/gup/commit/a322697))
- **providers:** Target paths built with the platform's own path flavour (`nvim` plugin managers, sdkman, nerd-fonts, self-update) ([`8fec144`](https://github.com/LINDECKER-Charles/gup/commit/8fec144))

## Removed

- **ui:** "Tout mettre à jour" and "Cible…" menu entries ([`541baad`](https://github.com/LINDECKER-Charles/gup/commit/541baad))

## Dependencies

- **deps:** Add `node-pty` 1.1.0 (optional, exact pin), `croner` 10.0.1 (exact pin), and dev-only `happy-dom` and `@xterm/headless` 6.0.0 for the 0.5.0 features; npm 11 asks to review node-pty's install script (`--allow-scripts=node-pty`) ([`9eb66c1`](https://github.com/LINDECKER-Charles/gup/commit/9eb66c1))

## Documentation

- **docs:** Design note of the foundation (slots, contracts, cookbook, superseded spec symbols, npm 11 install scripts), the changelog-fragment convention, and the CLI reference updated for the menu changes (`docs: describe the foundation extension points and changelog fragments`)

## Internal

- **core/platform, core/state, core/process, core/log, core/config, core/update:** Platform sets and target lookup, state dirs and the run context, PATH resolution out of the runner, install output sinks with the output router, a pipe sink, a command tracer and detached launches, a pluggable log facade, the persisted settings store with its file lock, one update pipeline for the CLI and the menu with an OS-released batch lock ([`80d45ed`](https://github.com/LINDECKER-Charles/gup/commit/80d45ed), [`1ac852d`](https://github.com/LINDECKER-Charles/gup/commit/1ac852d), [`585aa5a`](https://github.com/LINDECKER-Charles/gup/commit/585aa5a), [`fe6e299`](https://github.com/LINDECKER-Charles/gup/commit/fe6e299), [`a3f3eda`](https://github.com/LINDECKER-Charles/gup/commit/a3f3eda), [`25698d2`](https://github.com/LINDECKER-Charles/gup/commit/25698d2), [`3d98017`](https://github.com/LINDECKER-Charles/gup/commit/3d98017), [`f806467`](https://github.com/LINDECKER-Charles/gup/commit/f806467), [`0eb8bcc`](https://github.com/LINDECKER-Charles/gup/commit/0eb8bcc), [`e26f3da`](https://github.com/LINDECKER-Charles/gup/commit/e26f3da), [`03321b5`](https://github.com/LINDECKER-Charles/gup/commit/03321b5), [`b2a46cd`](https://github.com/LINDECKER-Charles/gup/commit/b2a46cd), [`6b3be2c`](https://github.com/LINDECKER-Charles/gup/commit/6b3be2c))
- **providers:** Aggregate rows and admin-only providers flagged for the scheduler ([`a5d56f9`](https://github.com/LINDECKER-Charles/gup/commit/a5d56f9))
- **cli:** Commands and startup hooks registered through CLI modules; `GUP_NONINTERACTIVE=1` makes every prompt fail fast ([`cfcadb0`](https://github.com/LINDECKER-Charles/gup/commit/cfcadb0))
- **ui:** Every screen painted through an appearance seam (legacy look unchanged, pinned by a regression test), the menu built from a view registry, updates launched through a pluggable launcher with menu preferences, package actions, marks and sort orders contributed by views, shared French formatting helpers, and the TUI test host and `bootMenu` driver under `tests/support/tui/` ([`7116328`](https://github.com/LINDECKER-Charles/gup/commit/7116328), [`c99814e`](https://github.com/LINDECKER-Charles/gup/commit/c99814e), [`d536ea5`](https://github.com/LINDECKER-Charles/gup/commit/d536ea5), [`cf0b908`](https://github.com/LINDECKER-Charles/gup/commit/cf0b908), [`f88f86f`](https://github.com/LINDECKER-Charles/gup/commit/f88f86f), [`f58de21`](https://github.com/LINDECKER-Charles/gup/commit/f58de21))
