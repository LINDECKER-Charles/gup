# Interactive app

`gup` with no subcommand opens a full-screen app: a menu on the left, the
selected view on the right, the keys that apply at the bottom. This page is
about **updating from it**: the update runs inside the app, in a run view with
a live terminal for the package being installed, and you land back on the
package list when it is over. The menu entries and the general keys are listed
in the [CLI reference](cli-reference.md#interactive-app).

- [Starting an update](#starting-an-update)
- [The run view](#the-run-view)
- [Answering an installer](#answering-an-installer)
- [Administrator rights](#administrator-rights)
- [Recoverable failures](#recoverable-failures)
- [Results](#results)
- [When another gup run is updating](#when-another-gup-run-is-updating)
- [When updates run outside the app](#when-updates-run-outside-the-app)
- [Colours in the terminal pane](#colours-in-the-terminal-pane)

## Starting an update

In **Paquets**, check what you want to update (`espace`, or `a` for everything
shown), then press `Entrée`. The confirmation lists the packages; it adds a
line when some of them need administrator rights (one UAC prompt, or one
`sudo` password, for all of them), and another one when the update will run
outside the app, with the reason (see
[below](#when-updates-run-outside-the-app)).

## The run view

The run view takes the whole body of the screen until you leave the results:

```
 gup v0.5.0  │  Mise à jour  │  2/5  │  01:12
╭─ Mise à jour ──────────────────────────────────────────────────────────────╮
│ ████████████████░░░░░░░░░░░░░░░░░░░░   2/5   ✔ 1   ↷ 0   ✖ 1        01:12 │
│                                                                            │
│ ✔ Git.Git             Winget        2.51.0 → 2.52.0                  00:14 │
│ ✖ 7zip.7zip           Winget        25.00 → 25.01                    00:06 │
│   └ hash d'installeur invalide — réessai proposé à la fin                  │
│ ◐ Microsoft.PowerToys Winget        0.93.0 → 0.94.0                  00:41 │
│ · typescript          npm (global)  5.8.2 → 5.9.3                          │
│ · nodejs              Chocolatey    22.1.0 → 22.2.0                  admin │
╰────────────────────────────────────────────────────────────────────────────╯
╭─ Winget · Microsoft.PowerToys ─────────────────────────────────────────────╮
│ Trouvé PowerToys [Microsoft.PowerToys] Version 0.94.0                      │
│ Téléchargement https://github.com/microsoft/PowerToys/releases/…           │
│   ██████████████████████▌               48.2 MB / 98.0 MB                  │
╰────────────────────────────────────────────────────────────────────────────╯
 s passer ce paquet · x tout arrêter · t écrire dans le terminal · v agrandir le terminal
```

- **One row per package**, in the order they run: `·` waiting, a spinner while
  it installs, `✔` updated, `↷` skipped, `✖` failed, `⊘` cancelled. A row
  shows its duration, `admin` for a package of the elevated batch and
  `↻ retry --force` on a retry. A line under it gives the installer's message
  when there is one.
- **The terminal pane** below shows the package being installed: its real
  output, progress bars included. The mouse wheel scrolls back through it.
- **Balanced or enlarged:** the list takes what it needs, up to a bit less than
  half the screen; `v` shrinks it to the progress line and the package in
  flight, and gives the rest to the terminal.

| Key | While it runs |
|---|---|
| `s` | Skip the package being installed (the batch goes on) |
| `x` | Stop everything: after a confirmation, the package in flight is interrupted and the rest is cancelled |
| `Ctrl+C` | Skip the package being installed; twice within 1.5 s, stop everything (no confirmation) |
| `t` | Type into the installer (below) |
| `v` | Enlarge the terminal, or give the list its room back |
| `↑↓`, `pgup`, `pgdn` | Scroll the package list |
| `q` | Refused while the update runs (`x` stops it) |

A skipped package ends `ignorée par l'utilisateur` and is never offered for a
retry. The per-install timeout (default 20 min) applies exactly as with
`gup update`.

## Answering an installer

Some installers ask: a licence, a `[Y/n]`, a password. Press **`t`** (or click
the pane) to give them the keyboard — the pane's border turns heavy and reads
`saisie active · Ctrl+G pour rendre la main`. Every key then goes to the
installer, `Ctrl+C`, `Échap` and pastes included. **`Ctrl+G`** gives the
keyboard back to gup; so does the end of the package.

When an installer has been silent for a few seconds on a line that looks like
a question, gup says so under its row: `⌨ Le programme attend peut-être une
réponse — t pour écrire dans le terminal.` gup never types an answer itself,
and never takes the keyboard from you.

## Administrator rights

Packages that need administrator rights run last, in one batch behind one
prompt, as with `gup update`:

- **Windows:** after you accept, a UAC prompt opens and the batch installs in
  its own administrator window, outside gup's reach. The run view waits for
  it (`Administrateur (UAC)`); `s` is refused, `x` stops the run once that
  window is done.
- **macOS and Linux:** the batch runs under `sudo` inside the terminal pane
  (`Administrateur (sudo)`): press `t` to type your password — once for the
  whole batch.

## Recoverable failures

When failures can be retried (an installer hash mismatch, a changed installer
technology…), a dialog offers the strategies once every package ran, least
aggressive first — the same ones as `gup update`. A chosen strategy replays
the failures in the run view, tagged `↻ <strategy>`. Nothing is retried after
you stopped the run.

## Results

When the batch is over the run view becomes its summary — what was updated,
skipped, failed, cancelled, and how long it took — with the cursor on the first
failure. `↑↓` selects a package and shows what its terminal kept: failed and
skipped packages keep their output (the twelve latest), and so do the three
latest successes. `Entrée`, `Échap` or `q` brings you back to **Paquets**,
where the updated packages are gone — without a new scan (`r` rescans). `o`
writes the [HTML report](journal-and-reports.md#in-the-browser-the-html-report)
of the Journal's period, this run included, and opens it in your browser
(unless Options › Ouvrir le rapport is `OFF`); the line above the list says
where it went.

If you turned on the end-of-run notification in the options, a run of a
minute or more ends with a notification from your terminal, where it supports
them.

## When another gup run is updating

Only one gup run updates packages at a time (a scheduled update, another
terminal). If one is already at work, the run view says so and waits for it to
end; `x` gives up and cancels everything.

## When updates run outside the app

Installs run in the app's terminal pane through
[node-pty](https://github.com/microsoft/node-pty), an optional dependency with
a native part. When it cannot be used, the confirmation says why and the
update runs outside the app, as in gup 0.4: the screen gives the terminal back,
installers print there, and `Entrée` brings you back to the menu.

| Reason shown | What it means | What to do |
|---|---|---|
| `désactivé par GUP_PTY` | `GUP_PTY` is `off`, `0`, `false` or `no` | Unset it |
| `node-pty absent` | The optional dependency is not installed (Linux without a build toolchain, `--omit=optional`) | Reinstall gup with a C/C++ toolchain available (Linux), or with optional dependencies |
| `lanceur pty-exec introuvable` | `dist/pty-exec.js` is missing next to `dist/cli.js` | Reinstall gup |
| `spawn-helper non exécutable — chmod +x <chemin>` | macOS: node-pty's helper lost its exec bit and gup could not restore it (another user owns it) | Run the `chmod +x` shown |
| `échec du test du pseudo-terminal : …` | The test run in a pseudo-terminal failed (an antivirus blocking `conpty.node`, for instance) | Check the detail; `GUP_PTY=off` silences the attempt |

`gup doctor` reports the same thing on its **Terminal intégré** line, in the
**Système** section.

**Installing with npm 11:** node-pty has an install script, which npm 11
reviews. `npm i -g @charles_lindecker/gup --allow-scripts=node-pty` runs it;
`--ignore-scripts` is harmless on Windows and macOS (node-pty ships prebuilt
binaries there, and gup restores the macOS helper's exec bit itself), but
leaves Linux without the embedded terminal.

## Colours in the terminal pane

Installers pick their own colours, for your terminal's palette. The pane
therefore keeps your terminal's own background, whatever gup's theme: only
its border follows the theme. gup's contrast guarantees cover gup's own text,
not what installers print.
