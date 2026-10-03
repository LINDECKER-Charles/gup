# Fragment — `feat/in-tui-updates`

Updates that run inside the full-screen app: a run view with a live embedded terminal for the
package being installed, then the results, then back to Paquets — without leaving gup. The
process side (an embedded pseudo-terminal behind the install sink) and the screen side (run view,
in-screen launcher, `gup doctor` line) both ship on this branch. Design note:
[`../../development/design/in-tui-updates.md`](../../development/design/in-tui-updates.md); user
guide: [`../../guide/interactive-app.md`](../../guide/interactive-app.md).

## Added

- **ui:** An update confirmed in the menu runs inside the app: a run view with one row per package (state, duration, admin and retry tags, the installer's message), the overall progress and clock, and a terminal pane showing the package being installed, progress bars included. `s` skips the install in flight, `x` stops everything after a confirmation, Ctrl+C skips and twice stops, `v` enlarges the pane, `q` is refused while it runs; the results keep the failed, skipped and recent outputs, and leaving them drops the updated packages from Paquets ([`f9ff62b`](https://github.com/LINDECKER-Charles/gup/commit/f9ff62b))
- **ui:** `t` (or a click on the pane) hands the keyboard to the installer — licences, `[Y/n]`, passwords, Ctrl+C included — until `Ctrl+G`; a hint says when a silent installer looks like it waits for an answer, and gup never types one itself ([`f9ff62b`](https://github.com/LINDECKER-Charles/gup/commit/f9ff62b))
- **ui:** Administrator packages: the run view waits for the UAC window on Windows, and on macOS/Linux the single `sudo` password of the batch is typed in the pane; recoverable failures get the retry strategies in a dialog and are replayed in the view; a run waiting for another gup update says so ([`f9ff62b`](https://github.com/LINDECKER-Charles/gup/commit/f9ff62b))
- **ui:** With the end-of-run notification turned on, a run of a minute or more ends with a notification from the terminal ([`f9ff62b`](https://github.com/LINDECKER-Charles/gup/commit/f9ff62b))
- **cli:** `gup doctor` reports the embedded terminal in its "Système" section: available, turned off by `GUP_PTY`, or why it cannot be used here (node-pty missing, macOS `spawn-helper` not executable, failed probe) ([`bd4de2a`](https://github.com/LINDECKER-Charles/gup/commit/bd4de2a))
- **core/pty:** Installs can run in an embedded pseudo-terminal: with the PTY sink routed, every `runInherit` starts a fixed trampoline (`dist/pty-exec.js`, a second 9 KB bundle) through node-pty, which hands the request back to the unchanged runner, so PATHEXT, `.cmd` escaping and the argv barrier work as without a PTY; prompts can be answered from the pane, a skip or timeout takes the whole tree down, and each session releases its pseudo-console when the installer exits (node-pty 1.1.0 alone leaves a `conhost.exe` and a worker thread behind per install). `GUP_PTY=off` (or `0`, `false`, `no`) turns it off; a missing node-pty, a missing trampoline, a macOS `spawn-helper` gup cannot make executable, or a failed spawn probe each give a French reason for falling back to updates outside the screen ([`2f3941b`](https://github.com/LINDECKER-Charles/gup/commit/2f3941b))
- **core/pty:** On Windows a successful install in the embedded terminal settles in about 250 ms instead of 1.2 s: the trampoline reports its exit code through a private result file instead of waiting for ConPTY's one-second output flush; failures still wait for the flush, so their last lines are complete; the file's private directory is gone before the install is reported, and when gup exits during an install (Ctrl+Break, the window closed) ([`4e04c80`](https://github.com/LINDECKER-Charles/gup/commit/4e04c80), [`fb97fb5`](https://github.com/LINDECKER-Charles/gup/commit/fb97fb5), [`8e119ff`](https://github.com/LINDECKER-Charles/gup/commit/8e119ff))

## Changed

- **ui:** When the embedded terminal is unavailable, the update confirmation says why, then the update runs outside the app as in 0.4 ([`f9ff62b`](https://github.com/LINDECKER-Charles/gup/commit/f9ff62b))

## Fixed

- **core/update:** A package whose update the runner's argv barrier refuses now fails on its own — recorded in the history as `refusé par la barrière de sécurité : …` — instead of stopping every package after it; any other provider error fails the package as `erreur inattendue : …` ([`7bd9156`](https://github.com/LINDECKER-Charles/gup/commit/7bd9156))

## Security

- **ui:** Keys reach an installer only after an explicit `t` or click, never while a dialog is open, and `Ctrl+G` is never forwarded; the installer's output is drawn by gup's terminal emulator rather than written to the user's terminal, so its own control sequences (screen clears, cursor moves) stay inside the pane ([`f9ff62b`](https://github.com/LINDECKER-Charles/gup/commit/f9ff62b))
- **core/pty:** node-pty only ever starts the trampoline, with a constant command line plus one base64url argument; drift tests keep node-pty named by its loader only, spawned by `PtySession` only, and its own `kill()` — whose Windows console-list agent printed a stack trace over the screen — out of `src`, `tests` and `scripts` ([`2f3941b`](https://github.com/LINDECKER-Charles/gup/commit/2f3941b))

## Documentation

- **docs:** A guide to updating from the interactive app: the run view and its keys, typing into an installer, administrator rights, the results, and why an update may run outside the app (`docs/guide/interactive-app.md`)
