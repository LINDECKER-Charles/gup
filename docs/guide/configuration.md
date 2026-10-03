# Configuration

`gup` works without any configuration. Change its settings in the **Options**
view of the interactive app (`gup`, then Options in the menu): each change
applies at once and is kept in one JSON file, read when `gup` starts. Scripts
are never affected by it except for the install timeout (see
[Scan & install](#scan--install)).

- [The Options view](#the-options-view)
- [Where the file lives](#where-the-file-lives)
- [What it looks like](#what-it-looks-like)
- [Sections](#sections)
- [Environment variables](#environment-variables)
- [When something is wrong](#when-something-is-wrong)
- [Security](#security)

Themes, custom colours and the contrast guarantee have their own page:
[`themes-and-accessibility.md`](themes-and-accessibility.md).

## The Options view

The settings are grouped in sections, one row per setting: `Label   [value]   hint`.

| Section | Rows |
|---|---|
| SCAN & INSTALLATION | Mode rapide, Timeout install, Filtre providers |
| APPARENCE | Thème, Couleurs perso., Niveau de contraste, Symboles, Densité |
| CONFORT | Vue au lancement, Scanner au lancement, Confirmer les MAJ, Rescanner après MAJ, Tri des paquets, Colonne Note, Providers incompat., Animations, Souris, Notification de fin |
| FICHIER | Réinitialiser…, Fichier (the file's state and path) |

| Key | Effect |
|---|---|
| `↑` `↓` (`k` `j`), `pgup` `pgdn`, `home` `end` | move between rows (section titles are skipped) |
| `entrée` / `espace` / a click | switch a value on or off, show the next value, or open the row (theme picker, colour editor, provider filter, a dialog) |
| `←` `→` | previous / next value of the row under the cursor (on other rows, `←` goes back to the menu as everywhere) |
| `r` | rescan with the new settings, after a scan setting changed |
| `c` | copy the settings file's path to the clipboard (terminals that support OSC 52) |
| `échap` | leave the theme picker, the colour editor or the provider filter |
| `tab` / `q` | back to the menu / quit, from anywhere |

- **Every change is saved at once**, except the theme under the picker's cursor
  (saved with `entrée`) and the colour nudges of the colour editor (saved when
  you move to another colour or leave it).
- When a change cannot be saved (locked file, read-only section), it stays in
  effect until `gup` exits and a line above the list says why:
  `⚠ Réglage non enregistré — <raison>`. The next save that works clears it.
- **Réinitialiser…** puts a group back to its defaults, after a confirmation that
  answers *Non* by default: *Apparence* (theme, colours, contrast, symbols,
  density), *Confort* (the rest of the comfort rows, mouse included), *Scan &
  installation* (fast mode, filter, timeout), or *Tout*.
- Fast mode, the filter and the timeout apply to the session at once; for the
  first two, `r` rescans with them. The launch view and "scan at launch" apply
  the next time the menu opens; everything else applies at once (sort, Note
  column, animations, mouse, symbols, density, theme, colours).
- In a narrow terminal (80 columns leave the Options panel 50), a hint that
  does not fit beside its row is shown whole under the list while the cursor is
  on that row, and the colour editor leaves out its "Affichée" column — the
  contrast column already says when a colour was adjusted.

## Where the file lives

| Platform | Path |
|---|---|
| Windows | `%APPDATA%\gup\config.json` (roams with your profile; the activity history stays machine-local) |
| macOS | `~/Library/Application Support/gup/config.json` |
| Linux and others | `$XDG_CONFIG_HOME/gup/config.json`, else `~/.config/gup/config.json` |
| Anywhere | `GUP_CONFIG_DIR=<dir>` → `<dir>/config.json` |

The Options view's **Fichier** row shows the same path and state (`c` copies
the path), and `gup doctor` prints them in its "Système" section
(`Configuration`). With `GUP_CONFIG=0` the file is neither read nor written:
`gup` runs on its defaults, which is the quickest way to tell whether a problem
comes from your settings.

## What it looks like

```json
{
  "version": 1,
  "sections": {
    "theme": { "v": 1, "id": "dark", "custom": { "dark": { "accent": "#FF8800" } } },
    "interface": { "v": 1, "mouse": false, "glyphs": "ascii" },
    "scan": { "v": 1, "fast": true },
    "install": { "v": 1, "timeoutSeconds": 600 }
  }
}
```

- **Only what differs from the defaults is written.** A default changed by a
  later release reaches you unless you changed that setting yourself.
- Each section has its own version (`v`). Sections and fields this version of
  `gup` does not know are kept as they are when it saves, so a newer and an
  older `gup` can share the file.
- Writes are atomic (temporary file, then rename): a crash leaves either the old
  file or the new one, never half of each.
- You may edit it by hand while `gup` is not running. A wrong value only resets
  that one setting to its default, and `gup` tells you which (see
  [When something is wrong](#when-something-is-wrong)).

## Sections

### `theme`

| Field | Values | Default |
|---|---|---|
| `id` | `terminal`, `auto`, `dark`, `light`, `high-contrast`, `colorblind`, `dracula`, `catppuccin-mocha`, `github-light`, `monochrome` | `terminal` |
| `contrast` | `AA` (text ≥ 4.5:1) or `AAA` (text ≥ 7:1) | `AA` |
| `custom` | per theme, colours for `accent`, `success`, `warning`, `danger`, `text`, `muted`, `background`, `highlight`, as `#RRGGBB` or `#RGB` | none |

Custom colours belong to the theme they are written under: an accent tuned for
`dark` does not change `light`. A colour too pale or too dark to read is adjusted
when painted (see [themes-and-accessibility.md](themes-and-accessibility.md#the-contrast-guarantee)).

### `interface`

| Field | Values | Default | What it does |
|---|---|---|---|
| `launchView` | `scan`, `packages`, `schedules`, `providers`, `journal`, `options` | `scan` | the view in front when the menu opens |
| `scanOnLaunch` | `true`, `false` | `true` | scan when the menu opens |
| `confirmBeforeUpdate` | `true`, `false` | `true` | ask before an update starts |
| `rescanAfterUpdate` | `true`, `false` | `false` | after an update, rescan everything instead of dropping the updated packages |
| `packageSort` | `provider`, `name`, `bump` | `provider` | package order inside each provider (`bump`: biggest version jump first) |
| `noteColumn` | `auto`, `hidden` | `auto` | the Paquets "Note" column |
| `animations` | `true`, `false` | `true` | spinners turn |
| `notifyOnDone` | `true`, `false` | `false` | notify the terminal when a long update ends |
| `showIncompatibleProviders` | `true`, `false` | `true` | list providers foreign to this OS (greyed) |
| `density` | `comfortable`, `compact` | `comfortable` | blank rows and inner padding |
| `glyphs` | `auto`, `unicode`, `ascii` | `auto` | symbol set (`auto`: ASCII on `TERM=linux`/`dumb`, `GUP_ASCII=1`, or without a UTF-8 locale on macOS/Linux) |
| `mouse` | `true`, `false` | `true` | mouse clicks and wheel in the screens |

### Scan & install

| Section | Field | Values | Default | Applies to |
|---|---|---|---|---|
| `scan` | `fast` | `true`, `false` | `false` | the interactive menu only |
| `scan` | `providerFilter` | provider ids (`["winget", "npm-g"]`), empty = all | `[]` | the interactive menu only |
| `install` | `timeoutSeconds` | `0` (no cap) to `86400` | `1200` | every command |

`gup list` and `gup update` keep their explicit flags (`--fast`, `--provider`):
a script never changes behaviour because of a setting it cannot see. The install
timeout is a safety net and applies everywhere, with this precedence:

> `--timeout` > `GUP_INSTALL_TIMEOUT` > `install.timeoutSeconds` > 1200 s

A filtered provider id this version of `gup` does not know is ignored (and
reported at startup).

## Environment variables

| Variable | Effect |
|---|---|
| `GUP_CONFIG` | `0`, `false`, `off` or `no`: run on defaults, never read or write the file |
| `GUP_CONFIG_DIR` | keep `config.json` in another directory |
| `NO_COLOR` | any non-empty value: no colour at all, in the screens (monochrome) and in console output ([no-color.org](https://no-color.org)) |
| `GUP_INSTALL_TIMEOUT` | per-install cap in seconds; wins over the file, `--timeout` wins over it |
| `GUP_ASCII` | `1`: ASCII symbols and borders when `glyphs` is `auto` |

## When something is wrong

`gup` never refuses to start because of its settings file. Problems are printed
once, on stderr, before any screen opens, and shown by `gup doctor`:

| Situation | What happens |
|---|---|
| A field has a wrong value | that field takes its default; `gup : configuration — interface.mouse : booléen attendu` |
| The file is not valid JSON (or larger than 256 KiB) | it is moved aside as `config.corrupt-<date>.json` next to it, and `gup` starts on defaults |
| It cannot even be moved aside, or the folder is unavailable | `gup` runs on defaults in memory and never overwrites the file |
| A newer `gup` wrote it | it is read, and left untouched (read-only) |
| A change cannot be saved (locked file, permissions) | it stays in effect until `gup` exits; the next start reads the file as it is |

## Security

- The elevated helper (`__admin-batch`, the one UAC / `sudo` prompt of an
  update) never reads this file: a file you can write must not steer a process
  running as administrator.
- No setting holds a command or a path to run. Provider ids are checked against
  a strict pattern and against the providers `gup` knows.
- On macOS and Linux the folder is created `0700` and the file `0600`; on
  Windows it inherits the per-user `%APPDATA%` permissions.
