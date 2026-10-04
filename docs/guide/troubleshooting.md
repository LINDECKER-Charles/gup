# Troubleshooting

Each entry starts with what you see — gup's messages are French, quoted as they appear — then
why, then what to do. Not listed here? [Collect a diagnostic](#collecting-a-diagnostic-for-a-bug-report)
and open a [bug report](https://github.com/LINDECKER-Charles/gup/issues/new?template=bug_report.yml).

- [Installing](#installing)
  - [npm warns about install scripts, or refuses to install](#npm-warns-about-install-scripts-or-refuses-to-install)
  - [The app needs Node 26.9](#the-app-needs-node-269)
- [The interactive app](#the-interactive-app)
  - [It refuses to start: no interactive terminal](#it-refuses-to-start-no-interactive-terminal)
  - [The Windows console host](#the-windows-console-host)
  - [Strange symbols or broken borders](#strange-symbols-or-broken-borders)
  - [Colours are hard to read](#colours-are-hard-to-read)
- [Updates](#updates)
  - [The embedded terminal is unavailable](#the-embedded-terminal-is-unavailable)
  - [The update waits for another gup](#the-update-waits-for-another-gup)
  - [Administrator packages were skipped](#administrator-packages-were-skipped)
  - [An install hangs](#an-install-hangs)
- [Providers and packages](#providers-and-packages)
  - [A provider is "not installed", or greyed out](#a-provider-is-not-installed-or-greyed-out)
  - [A package I expected is missing](#a-package-i-expected-is-missing)
- [Scheduled updates did not run](#scheduled-updates-did-not-run)
- [The HTML report did not open](#the-html-report-did-not-open)
- [The settings file](#the-settings-file)
- [Where gup stores its files](#where-gup-stores-its-files)
- [Collecting a diagnostic for a bug report](#collecting-a-diagnostic-for-a-bug-report)

## Installing

### npm warns about install scripts, or refuses to install

```text
npm warn install-scripts 1 package has install scripts not yet covered by allowScripts:
npm warn install-scripts   node-pty@1.1.0 (install: node scripts/prebuild.js || node-gyp rebuild; postinstall: node scripts/post-install.js)
```

or, with npm 12, `1 package had install scripts blocked because they are not covered by
allowScripts:`; or, with `strict-allow-scripts` set, `npm error code ESTRICTALLOWSCRIPTS`.

**Why.** node-pty, the optional pseudo-terminal behind updates inside the app, has install scripts,
and npm 11 and later ask you to review them: npm 11 still runs them, npm 12 skips them.

**Fix.** Allow it: `npm install -g @charles_lindecker/gup --allow-scripts=node-pty`. Skipping it
with `--ignore-scripts` is harmless on Windows and macOS, but leaves Linux without the embedded
terminal. Details: [installation.md § npm 11 and install scripts](installation.md#npm-11-and-install-scripts).

### The app needs Node 26.9

```text
Error: l'interface interactive de gup nécessite Node.js >= 26.9.0 (node:ffi) — version actuelle v24.11.0
```

**Why.** The interactive app's renderer loads through `node:ffi`, on by default from Node 26.9.
`gup list --json` and `gup update -y` do not load it, but the package requires Node ≥ 26.9 anyway
(`engines`).

**Fix.** Upgrade Node, ideally through a version manager:

| OS | Command |
|---|---|
| Windows | `winget upgrade OpenJS.NodeJS` (or `nvm install 26` with nvm-windows, `fnm install 26`, `volta install node@26`) |
| macOS | `brew upgrade node` (or `fnm install 26`, `nvm install 26`, `volta install node@26`) |
| Linux | your version manager: `fnm install 26`, `nvm install 26`, `volta install node@26` |

Then reinstall gup for the new Node: `npm install -g @charles_lindecker/gup --allow-scripts=node-pty`.

## The interactive app

### It refuses to start: no interactive terminal

```text
Error: cette action demande un terminal interactif (stdin/stdout TTY)
```

**Why.** `gup` (the app), the `gup update` picker and its prompts need a real terminal on stdin and
stdout. A pipe, a redirect, a CI job or a scheduled task has none.

**Fix.** In scripts, use the commands that never prompt: `gup list` or `gup list --json`,
`gup update --all -y`, `gup update provider:package -y`.

### The Windows console host

The classic console window (conhost, what `cmd.exe` opens outside Windows Terminal) is supported,
but it has limits:

- **Secondary text looks like normal text.** conhost does not draw "dim" text; symbols and labels
  carry the difference.
- **Crashes when leaving the app** (Windows 11 24H2, conhost 10.0.26100) were fixed in gup 0.5.0:
  gup leaves the full-screen view while the keyboard is still in raw mode, the order that console
  needs. If a console window still dies when you quit or when an update starts, update gup and
  report it with your exact Windows build (`winver`).
- Its colour palette cannot be read by gup: the default `terminal` theme then cannot verify
  contrast (see [below](#colours-are-hard-to-read)).

**Recommended:** [Windows Terminal](https://aka.ms/terminal), the default on recent Windows 11.

### Strange symbols or broken borders

Boxes, question marks or misaligned borders mean your font or console cannot draw a symbol.

gup only draws symbols that both Consolas — the Windows console host's default font — and
Cascadia Mono, Windows Terminal's, contain: box drawing, shade and half blocks, `√ × ‼ → ▪ ± ∞ ◌`
and the spinner `│ ╱ ─ ╲`. The console host cannot borrow a missing symbol from another font,
so with an older font such as Lucida Console the rounded and heavy panel corners show as boxes:
pick Consolas or Cascadia Mono in the window's *Properties › Font*.

**Fix.** Options › **Symboles** › `ascii`, or `GUP_ASCII=1` for a run: every symbol switches to a
one-column ASCII stand-in, and layouts do not move. gup switches by itself on `TERM=linux`,
`TERM=dumb`, and on macOS/Linux without a UTF-8 locale (`LANG=en_US.UTF-8` fixes the latter).

### Colours are hard to read

- **The theme hint says `? palette du terminal inconnue — contraste non vérifiable`.** Your
  terminal did not answer gup's palette query (OSC 4/10/11: conhost, some multiplexers), so the
  default `terminal` theme uses your terminal's own colours unverified. Pick an RGB theme in
  Options › **Thème** (`dark`, `light`, `high-contrast`…): their contrast is guaranteed.
- **A colour you set is not the one shown.** It was too pale or too dark to read and was moved to
  the closest readable one; the colour editor says `avant → après ‼`.
- **Installer output in the update pane is white on a light terminal.** A known issue of the
  embedded terminal — see [themes-and-accessibility.md](themes-and-accessibility.md#the-embedded-terminal):
  use a dark terminal profile while updating, or `GUP_PTY=off`.
- **No colour at all.** `NO_COLOR` is set in your environment; gup honours it everywhere.

## Updates

### The embedded terminal is unavailable

The update confirmation says
`Terminal intégré indisponible (<raison>) : la mise à jour s'exécutera dans le terminal, hors de l'interface.`,
and `gup doctor` shows the same reason on its **Terminal intégré** line. The update still works: it
runs in your terminal, outside the app, as before 0.5.0.

| Reason | Fix |
|---|---|
| `désactivé par GUP_PTY` | `GUP_PTY` is `off`, `0`, `false` or `no` in your environment: unset it |
| `node-pty absent` | **Linux:** node-pty has no prebuilt binary there and compiles at install time; install a toolchain — `sudo apt install build-essential python3` (Debian, Ubuntu), `sudo dnf install gcc-c++ make python3` (Fedora), `sudo pacman -S base-devel python` (Arch) — then reinstall gup with `--allow-scripts=node-pty`. **Elsewhere:** gup was installed without optional dependencies (`--omit=optional`); reinstall it normally |
| `lanceur pty-exec introuvable` | the installation is incomplete (`dist/pty-exec.js` missing): reinstall gup |
| `spawn-helper non exécutable — chmod +x <chemin>` | **macOS:** node-pty's helper lost its exec bit (npm ships it without) and gup could not restore it because another user owns the file; run the `chmod +x` shown |
| `échec du test du pseudo-terminal : …` | the test run in a pseudo-terminal failed — often security software blocking `conpty.node` on Windows; check the detail, or set `GUP_PTY=off` to stop trying |

### The update waits for another gup

```text
Une mise à jour planifiée est en cours (commencée il y a 4 min) — attente…
```

**Why.** One update batch at a time per user: a scheduled update or another terminal is already
driving your package managers. gup waits for it to finish.

**Fix.** Wait, or give up: `x` in the app's run view, Ctrl+C in a terminal. The lock is released by
the system when its holder exits, however it exits; if the wait never ends, a gup process is still
running — find it (Task Manager, `ps aux | grep gup`) and let it finish or close it.

### Administrator packages were skipped

```text
→ nodejs-lts   Élévation refusée par l'utilisateur
```

**Why.** Packages that need administrator rights run in one batch behind one UAC prompt (Windows)
or one `sudo` password (macOS, Linux). Declining it, or the prompt failing, skips the batch — a
choice, not an error. A scheduled run never elevates:
`Droits administrateur requis : non disponible sans surveillance`.

**Fix.** Run the update again from the app or with `gup update` and accept the prompt. On Windows the
batch installs in its own administrator window; answer there, not in gup's pane.

### An install hangs

A stalled download, the Windows Installer mutex, an installer waiting on a dialog: skip it with `s`
in the app's run view (or Ctrl+C in a terminal) — the batch goes on. The per-install timeout
(20 minutes by default) does it for you; change it in Options › **Timeout install**, with
`GUP_INSTALL_TIMEOUT`, or `gup update --timeout`. If the installer is waiting for an answer, press
`t` in the run view to type into it ([how](interactive-app.md#answering-an-installer)).

## Providers and packages

### A provider is "not installed", or greyed out

`gup doctor` (or the **Providers** view) puts every provider in one of three groups:

- **Non installés / hors PATH** (not installed / not on PATH): gup did not find the tool. Install it
  with the hint shown, or make sure its directory is on the `PATH` of the terminal you run gup
  from — open a new terminal after installing. A probe that does not answer within 15 s also lands
  here.
- **Incompatibles avec \<OS\>** (greyed, marked `–`): the provider belongs to another system
  (`macOS uniquement`). gup never probes it here; this is not a fault. Options › **Providers
  incompat.** hides the group.
- A provider you expected but that `gup list --provider <id>` ignores with
  `Attention : Provider <id> indisponible sur … — ignoré.` is one of those.

### A package I expected is missing

- **Fast mode or a filter is on.** The title bar says `mode rapide`, or `… · n filtrés` after the
  number of providers detected:
  Options › **Mode rapide** and **Filtre providers**, then `r`.
- **The provider cannot update it automatically.** Items only a GUI can update (Toolbox-managed
  JetBrains IDEs, some App Installer packages) are left out on purpose.
- **Another manager owns the binary.** When a toolchain manager owns a tool on your `PATH`
  (nvm-windows owning `node`, pyenv owning `python`), gup does not offer the OS package manager's
  copy, which would shadow it. Run `gup --log-level debug` once, then `gup log --grep ownership` to
  see what was left out and why.
- **The provider's scan failed.** Its row in **Scan** or **Paquets** shows the error; `gup log -l warn`
  has the detail.

## Scheduled updates did not run

1. `gup schedule status` (or the first line of **Planification**) — the trigger's state, with the
   fix for each case: not installed, no tick for a while, registered for an older path, owned by
   another installation of gup, disabled in macOS's Login Items. Every line is explained in
   [scheduled-updates.md § Troubleshooting](scheduled-updates.md#troubleshooting).
2. `gup schedule list` — was the run *missed* (the machine was off and catch-up is off), *skipped*
   (administrator rights needed, another gup was updating), or did it fail?
3. Look at the trigger itself:

   | OS | Command |
   |---|---|
   | Windows (PowerShell) | `Get-ScheduledTask -TaskName 'gup-scheduler-*' \| Get-ScheduledTaskInfo` |
   | macOS | `launchctl print gui/$(id -u)/io.github.lindecker-charles.gup.scheduler` |
   | Linux | `crontab -l` (look for the `gup-scheduler` block) |

4. `gup log --grep scheduler` — every tick that found something to do, and why it did or did not
   run; on macOS, launchd's own errors are in the scheduler directory's `agent-stderr.log`.

A run starts within 15 minutes after its time, and not during the first 5 minutes after the
machine boots.

## The HTML report did not open

```text
  rapport écrit : C:\Users\you\AppData\Local\gup\reports\gup-report-20261003-142205.html
  impossible d'ouvrir le navigateur — ouvrez le fichier ci-dessus
  file:///C:/Users/you/AppData/Local/gup/reports/gup-report-20261003-142205.html
```

(in the Journal: `Rapport écrit, ouverture automatique impossible — ouvrez : <chemin>`)

The report is written either way; only opening it failed or was not attempted (then the second
line is left out):

| Why | Fix |
|---|---|
| Options › **Ouvrir le rapport** is `OFF` | turn it on, or `gup report --open` |
| Not run from a terminal, or `CI` is set | `gup report --open` opens it anyway |
| Linux: no desktop opener (`xdg-open` missing, a server without a desktop) | install `xdg-utils`, or open the file yourself |
| WSL: no `wslview` | install `wslu`, or open the file from Windows |
| Windows: the path holds a comma or a quote, which `explorer.exe` would split | write the report elsewhere: `gup report --out <path>` |

Open the printed path in any browser: the file needs no network and no gup.

## The settings file

Problems with `config.json` are printed once when gup starts, before any screen
(`gup : configuration — interface.mouse : booléen attendu`), and by `gup doctor` on its
**Configuration** line. A wrong value only resets that setting; a corrupt file is moved aside as
`config.corrupt-<date>.json` and gup starts on defaults. To tell whether a problem comes from your
settings at all, run once with `GUP_CONFIG=0` (defaults, file neither read nor written). Every case:
[configuration.md § When something is wrong](configuration.md#when-something-is-wrong).

## Where gup stores its files

| What | Windows | macOS | Linux | Override |
|---|---|---|---|---|
| Settings (`config.json`) | `%APPDATA%\gup` | `~/Library/Application Support/gup` | `$XDG_CONFIG_HOME/gup` (else `~/.config/gup`) | `GUP_CONFIG_DIR` |
| Activity history | `%LOCALAPPDATA%\gup\history` | `~/Library/Application Support/gup/history` | `$XDG_STATE_HOME/gup/history` (else `~/.local/state/gup/history`) | `GUP_HISTORY_DIR` |
| Debug log | `%LOCALAPPDATA%\gup\logs` | `~/Library/Logs/gup` | `$XDG_STATE_HOME/gup/logs` | `GUP_LOG_DIR` |
| Reports, diagnostic archives | `%LOCALAPPDATA%\gup\reports` | `~/Library/Application Support/gup/reports` | `$XDG_STATE_HOME/gup/reports` | `GUP_REPORT_DIR` |
| Schedules and their state | `%LOCALAPPDATA%\gup\scheduler` | `~/Library/Application Support/gup/scheduler` | `$XDG_STATE_HOME/gup/scheduler` | `GUP_SCHEDULER_DIR` |
| Update lock (empty between runs) | `%LOCALAPPDATA%\gup\locks` | `~/Library/Application Support/gup/locks` | `$XDG_STATE_HOME/gup/locks` | `GUP_SCHEDULER_DIR` (the lock moves into it) |

Settings roam with your Windows profile; everything else is machine-local. `gup log path` prints
the log directory; the Options view's **Fichier** row shows the settings file (`c` copies its path).

## Collecting a diagnostic for a bug report

1. `gup --version`, `node --version`, your OS version and the terminal you use.
2. `gup doctor` — the providers it sees and the **Système** section.
3. Reproduce with more detail in the log, then export it:

   ```bash
   gup --log-level debug                       # or: gup update <provider:package> --log-level debug
   gup log export --since 1d                   # writes gup-diagnostic-<date>.zip, prints its path
   ```

   The archive holds the log of the period (redacted again), a machine description from a fixed
   list of variables, a summary of the activity, and a README. **Open it and read it before you
   share it**: known secret shapes are masked and your home directory becomes `~`, but a secret in
   a format gup does not know can slip through.
4. Attach it to the [bug report](https://github.com/LINDECKER-Charles/gup/issues/new?template=bug_report.yml).
   [SUPPORT.md](../../.github/SUPPORT.md#what-to-include) lists the rest of what helps.

A security problem is never a public issue: [SECURITY.md](../../.github/SECURITY.md#reporting-a-vulnerability).
