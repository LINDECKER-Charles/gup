# Fragment — `feat/in-tui-updates`

Updates that run inside the full-screen app, in an embedded terminal. This fragment covers the
process side (part 1); the run view, the in-screen launcher and the user guide follow on the same
branch. Design note:
[`../../development/design/in-tui-updates.md`](../../development/design/in-tui-updates.md).

## Added

- **core/pty:** Installs can run in an embedded pseudo-terminal: with the PTY sink routed, every `runInherit` starts a fixed trampoline (`dist/pty-exec.js`, a second 9 KB bundle) through node-pty, which hands the request back to the unchanged runner, so PATHEXT, `.cmd` escaping and the argv barrier work as without a PTY; prompts can be answered from the pane, a skip or timeout takes the whole tree down, and each session releases its pseudo-console when the installer exits (node-pty 1.1.0 alone leaves a `conhost.exe` and a worker thread behind per install). `GUP_PTY=off` (or `0`, `false`, `no`) turns it off; a missing node-pty, a missing trampoline, a macOS `spawn-helper` gup cannot make executable, or a failed spawn probe each give a French reason for falling back to updates outside the screen ([`2f3941b`](https://github.com/LINDECKER-Charles/gup/commit/2f3941b))
- **core/pty:** On Windows a successful install in the embedded terminal settles in about 250 ms instead of 1.2 s: the trampoline reports its exit code through a private result file instead of waiting for ConPTY's one-second output flush; failures still wait for the flush, so their last lines are complete; the file's private directory is gone before the install is reported ([`4e04c80`](https://github.com/LINDECKER-Charles/gup/commit/4e04c80), [`fb97fb5`](https://github.com/LINDECKER-Charles/gup/commit/fb97fb5))

## Fixed

- **core/update:** A package whose update the runner's argv barrier refuses now fails on its own — recorded in the history as `refusé par la barrière de sécurité : …` — instead of stopping every package after it; any other provider error fails the package as `erreur inattendue : …` ([`7bd9156`](https://github.com/LINDECKER-Charles/gup/commit/7bd9156))

## Security

- **core/pty:** node-pty only ever starts the trampoline, with a constant command line plus one base64url argument; drift tests keep node-pty named by its loader only, spawned by `PtySession` only, and its own `kill()` — whose Windows console-list agent printed a stack trace over the screen — out of `src`, `tests` and `scripts` ([`2f3941b`](https://github.com/LINDECKER-Charles/gup/commit/2f3941b))
