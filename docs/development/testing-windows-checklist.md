# Manual test checklist — Windows

What the automated layers cannot see on Windows: a real console window (conhost and its
10.0.26100 teardown constraint), Windows Terminal, the shells users type `gup` into, a UAC prompt,
an installer's own window, the system's high-contrast mode. Run it before a release, on a
Windows 10 or 11 machine with the build under test; the strategy behind it is in
[`testing.md`](testing.md#9-manual-campaigns).

Copy the header and the results table into the pull request description, fill in one row per
step, and attach the screenshots the *Notes* column names. `PASS`, `FAIL` (with what was seen) or
`N/A` (with why: the tool is not installed, …).

## Header

| Field | Value |
|---|---|
| Commit | `git rev-parse --short HEAD` |
| Windows | `winver` (edition, version, build) |
| Architecture | `$env:PROCESSOR_ARCHITECTURE` |
| Node | `node --version` (≥ 26.9) |
| Terminals | Windows Terminal (*About*), PowerShell 7 `$PSVersionTable.PSVersion`, VS Code |
| Tester, date | |

## Sandbox

Steps marked **(sandbox)** run with every directory gup writes to in a temp folder, so the
tester's own history, settings and schedules stay untouched. In PowerShell:

```powershell
$sb = Join-Path $env:TEMP "gup-manual-$(Get-Random)"
foreach ($dir in 'history','config','logs','reports','scheduler','npm') {
  New-Item -ItemType Directory -Force (Join-Path $sb $dir) | Out-Null
}
$env:GUP_HISTORY_DIR = "$sb\history"; $env:GUP_CONFIG_DIR = "$sb\config"
$env:GUP_LOG_DIR = "$sb\logs"; $env:GUP_REPORT_DIR = "$sb\reports"
$env:GUP_SCHEDULER_DIR = "$sb\scheduler"; $env:npm_config_prefix = "$sb\npm"
npm install --global is-number@6.0.0   # one outdated package, in the sandbox only
```

Close the window (or `Remove-Item -Recurse $sb`) when done. `node dist\cli.js` stands for `gup`
below when testing a checkout rather than an installed build.

## Steps

| ID | Area | Step | Expected |
|---|---|---|---|
| W-01 | prerequisites | Node 26 first on `PATH`; `npm ci`; `npm run build` | green, `dist\cli.js` and `dist\pty-exec.js` present |
| W-02 | automated | `scripts\check.cmd -E2E mutate` (consent: it updates `is-number` in a throw-away npm prefix and creates, runs and deletes a `gup-it-<random>` scheduled task); `npm run fixtures:record -- --provider <ids>` for the tools installed here | all green; `Get-ScheduledTask gup-*` lists nothing afterwards; fixture diff reviewed, package names neutralised before any commit |
| W-03 | conhost | Win+R → `conhost.exe cmd /k node dist\cli.js` **(sandbox)**; ↓ ↓, Espace, `q` | the window **survives** (10.0.26100 constraint), the prompt comes back, no stray escape codes |
| W-04 | conhost | same, then quit with Ctrl+C; then `set GUP_PTY=off` and run W-08's update | survives both; with `GUP_PTY=off` the update leaves the screen, `Entrée pour revenir à gup…`, the menu comes back |
| W-05 | Windows Terminal | `gup` **(sandbox)**; resize the window down to 80×24 and back; click a package row; scroll with the wheel | the layout follows the size, nothing overlaps; the click checks the row |
| W-06 | shells | `gup --version`, `gup doctor`, `gup list` in PowerShell 5.1, PowerShell 7, cmd.exe and the VS Code terminal | same output everywhere; accents (`détectés`, `Système`) correct |
| W-07 | Git Bash (mintty) | `gup` | the French non-TTY message, exit 1, no crash |
| W-08 | in-menu update | **(sandbox)** Paquets: check `is-number`, Entrée, `o` | the run view opens, npm's output scrolls in the embedded pane, `√ 1 mis à jour`; Entrée returns to Paquets without the package; the history records it with `trigger: "menu"` |
| W-09 | stop and skip | repeat W-08 (`npm install --global is-number@6.0.0` first): `s` during the install; again with Ctrl+C once, then twice; `x`; `t`, a few keys, Ctrl+G | `s` and the first Ctrl+C skip the current package, a second Ctrl+C or `x` stops the run; in typing mode the keys go to the pane only and Ctrl+G gives them back; the terminal is restored after quitting |
| W-10 | installer window | update one real winget package whose installer shows a window (a package you meant to update anyway) | the installer window is visible, the pane waits, the outcome is recorded |
| W-11 | retry | provoke a retryable winget failure (the application left running) | the end-of-run consent dialog; nothing is retried with `--force` unless chosen |
| W-12 | UAC | with an admin-only Chocolatey or Npackd package: update it from the menu | one UAC prompt for the batch; the run view shows the administrator step and the outcomes |
| W-13 | themes and contrast | Options → each built-in theme, in Windows Terminal dark and light and in conhost; a custom accent that fails AA | every screen readable; the enforcement notice for the failing colour |
| W-14 | OS greying | Providers view and `gup doctor` | the incompatible group is dimmed but readable, its count matches the registry's macOS/Linux-only providers |
| W-15 | scheduler | `gup schedule add npm-g:is-number --every daily --at <in 20 min>` (registers the real per-user trigger `gup-scheduler-<SID>`); `schtasks /Query /TN gup-scheduler-<SID> /XML`; wait for the time; `gup schedule list`; `gup schedule uninstall --purge` | task with `InteractiveToken`, `LeastPrivilege`, `PT15M`, `conhost.exe --headless`; no window ever opens; the run is listed with its result; after uninstall the query fails |
| W-16 | journal and report | Journal view: the four tabs, `e` export, `o` report; `gup report --since all` | the export file is written; the report opens in the default browser, works offline, no CSP error in the console |
| W-17 | high contrast | Windows *Contrast themes* on; `gup` | still readable; nothing relies on colour alone |

## Results

```
| ID   | Result | Notes / screenshot |
|------|--------|--------------------|
| W-01 |        |                    |
```
