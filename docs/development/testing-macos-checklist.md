# Manual test checklist — macOS

The battery for a session on a real Mac: what neither the simulation that runs on every OS nor
the `macos-latest` CI runners can show — Terminal.app and iTerm2 in their light and dark
profiles, a `sudo` password typed into the embedded terminal, the exec bit of node-pty's
`spawn-helper` after a script-less install, launchd as Login Items shows it, the HTML report in
Safari, VoiceOver, an Intel Mac. The strategy behind it is in
[`testing.md`](testing.md#9-manual-campaigns).

Copy the header and the results table into the pull request description, one row per step,
with the screenshots the *Notes* column names. `PASS`, `FAIL` (with what was seen) or `N/A`
(with why).

## What CI already covers

Not to repeat by hand: on every pull request the `macos-latest` leg (Apple silicon) runs the
typecheck, the unit, providers and integration projects (real `which`, symlinks, exec bits, a
real PTY), and the end-to-end smoke (the menu in a real macOS pseudo-terminal); the
`packed install` job checks `npm i -g <tarball> --ignore-scripts` then `gup doctor`. The weekly
`e2e.yml` adds the real tools of the runner image, the sandboxed update and the provider
fixtures recorded on macOS.

## Header

| Field | Value |
|---|---|
| Commit | `git rev-parse --short HEAD` |
| macOS | `sw_vers` |
| Architecture | `uname -m` (`arm64` or `x86_64`) |
| Node | `node --version` (≥ 26.9; `brew install node` or a version manager) |
| Terminals | Terminal.app and iTerm2 versions (*About*), optional Ghostty / WezTerm |
| Tester, date | |

## Sandbox

Steps marked **(sandbox)** keep gup's history, settings and schedules out of the tester's
profile. In zsh:

```zsh
sb=$(mktemp -d -t gup-manual)
export GUP_HISTORY_DIR=$sb/history GUP_CONFIG_DIR=$sb/config GUP_LOG_DIR=$sb/logs
export GUP_REPORT_DIR=$sb/reports GUP_SCHEDULER_DIR=$sb/scheduler npm_config_prefix=$sb/npm
npm install --global is-number@6.0.0   # one outdated package, in the sandbox only
```

`node dist/cli.js` stands for `gup` below when testing a checkout.

## Steps

| ID | Area | Step | Expected |
|---|---|---|---|
| M-01 | prerequisites | `npm ci`, `npm run build`; `npm run test:e2e:smoke` | node-pty's darwin prebuild loads (`gup e2e: embedded terminal available on darwin`), green |
| M-02 | automated | `npm run test:run`; `npm run test:e2e:mutate` (consent: it updates `is-number` in a throw-away npm prefix); `npm run fixtures:record -- --all` | green; recorded darwin fixtures and goldens reviewed (package names neutralised) before any commit |
| M-03 | Terminal.app | profile **Basic** (light) then **Pro** (dark), System Settings appearance light then dark: `gup` **(sandbox)**, every view, resize, `q`; then W-08's update from Packages | frames intact, every text readable, the screen restored on quit. Known issue to confirm: on Basic, the embedded pane draws installer output and gup's notes in white (1.00:1 on white) — screenshot it |
| M-04 | iTerm2 | same as M-03 with a light and a dark preset, then mouse: click a row, wheel | same; the click checks the row, the wheel scrolls |
| M-05 | sudo in the pane | update a Homebrew cask whose installer asks for the password (or a MacPorts port, M-07) from the menu; type the password in the pane (`t`, then Ctrl+G) | one `sudo` prompt for the batch, in the pane; the password is not echoed and appears neither in `gup log` nor in `gup log export` |
| M-06 | mas | Mac App Store signed in, then signed out: `gup list --provider mas` and an update | the update runs signed in; signed out, a clear skip message |
| M-07 | MacPorts, Fink | (if installed) update a port or a package from the menu | the sudo step of M-05, once per batch |
| M-08 | OS greying | Providers view and `gup doctor` | the `Incompatible with macOS` group (`Windows only` on each row) is dimmed but readable; its count matches the registry's Windows-only providers |
| M-09 | spawn-helper | `npm pack`; `npm i -g ./*.tgz --ignore-scripts`; `ls -l "$(npm root -g)/@charles_lindecker/gup/node_modules/node-pty/prebuilds/darwin-$(uname -m)/spawn-helper"`; `gup doctor`; `ls -l` again | before: `-rw-r--r--` (the tarball's mode); `gup doctor` reports the embedded terminal available; after: executable. With a `spawn-helper` owned by root (`sudo chown root`), the doctor line says `spawn-helper not executable — chmod +x <path>` and updates leave the screen |
| M-10 | launchd | `gup schedule add npm-g:is-number --every daily --at <in 20 min>` without `GUP_SCHEDULER_DIR`; watch for macOS's *Background Items Added*; System Settings → General → Login Items; wait for the time; `gup schedule list`; turn the item off in Login Items, `gup schedule status`; `gup schedule uninstall --purge` | no sudo asked; the notification names gup; the run is listed with its result; switched off, `status` says so and how to repair; after uninstall `launchctl print gui/$(id -u)/io.github.lindecker-charles.gup.scheduler` fails and the plist is gone |
| M-11 | launchd after a Node change | with a schedule installed, switch Node (nvm / brew upgrade), then `gup` | the trigger is re-registered for the new path (self-heal), `gup schedule status` healthy |
| M-12 | journal and report | Journal view: the four tabs, `e` export, `o` report; `gup report --since all` with Safari as the default browser | the export is written; the report opens in Safari, works offline, keyboard navigation and dark mode work, no CSP error in the Web Inspector console |
| M-13 | themes | Options → each built-in theme in Terminal.app Basic and Pro; *Increase contrast* on (Accessibility → Display) | readable everywhere; the custom-colour enforcement notice on a failing accent |
| M-14 | VoiceOver | Cmd+F5, then `gup`: move through the sidebar, Packages, a dialog | the focused row and the dialog text are read; nothing essential is conveyed by colour alone |
| M-15 | Ctrl+C and skip | W-09 of the Windows checklist, on macOS | same behaviour; the terminal restored after quitting |
| M-16 | Intel | (if an Intel Mac is available) M-01 to M-04 and M-09 on `x86_64` | same results; the `darwin-x64` prebuild loads |

## Results

```
| ID   | Result | Notes / screenshot |
|------|--------|--------------------|
| M-01 |        |                    |
```
