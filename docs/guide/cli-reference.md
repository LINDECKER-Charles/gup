# CLI reference

`gup` on its own opens the [interactive app](interactive-app.md). The subcommands bypass it and
are what you script against: `list`, `update` and `doctor` act on your package managers, `log`
and `report` read what gup recorded, `schedule` manages scheduled updates.

- [Commands](#commands)
- [Global options](#global-options)
- [`gup list`](#gup-list)
- [`gup update`](#gup-update-targets)
- [`gup doctor`](#gup-doctor)
- [`gup log`](#gup-log)
- [`gup report`](#gup-report)
- [`gup schedule`](#gup-schedule)
- [Interactive app](#interactive-app)
- [Targeting a package](#targeting-a-package)
- [Fast mode](#fast-mode)
- [Skipping stuck installs](#skipping-stuck-installs)
- [Retrying failed updates](#retrying-failed-updates)
- [Elevated updates](#elevated-updates)
- [JSON output](#json-output)
- [Environment variables](#environment-variables)
- [Exit codes](#exit-codes)
- [Activity history](#activity-history)

> **CLI output is French.** That is deliberate: the interface language is French, the
> documentation language is English. See the language rule in
> [`CONTRIBUTING.md`](../../CONTRIBUTING.md#7-code-style).

## Commands

```bash
gup                                                  # the interactive app
gup list                                             # list outdated packages
gup list --fast                                      # skip the slow scans
gup list --provider winget npm-g                     # restrict to some providers
gup list --json                                      # pipeable JSON output
gup update                                           # pick packages, then update them
gup update --all -y                                  # everything, no prompt (CI)
gup update winget:Spotify.Spotify npm-g:typescript   # specific targets, no scan
gup update --all --timeout 300                       # auto-skip installs over 5 min
gup doctor                                           # detected, missing and incompatible providers
gup log                                              # the debug log's latest lines
gup log export                                       # a diagnostic archive for a bug report
gup report                                           # the HTML activity report, in the browser
gup report --format csv --since 30d                  # the last 30 days' update attempts, as CSV
gup schedule add winget:Git.Git --every weekly --on lun
gup schedule list                                    # schedules, next and last runs
gup --version                                        # print the version
```

## Global options

| Option | Effect |
|---|---|
| `--log-level <niveau>` | The debug log's level for this run: `off`, `error`, `warn`, `info`, `debug` or `trace`. Wins over `GUP_LOG_LEVEL` and the Options setting ([levels](journal-and-reports.md#levels)). Accepted before or after the command; anything else exits `2` before the command runs. |
| `-V, --version` | Print the version. |
| `-h, --help` | Help for gup, or for a command (`gup report --help`). |

## `gup list`

Scans and prints the outdated packages as a table. Read-only: it never installs anything.

| Flag | Effect |
|---|---|
| `-p, --provider <ids...>` | Restrict the scan to these provider ids |
| `--fast` | Skip providers marked `slow` — see [Fast mode](#fast-mode) |
| `--json` | Raw JSON on stdout, no screen, no table — see [JSON output](#json-output) |

Packages a provider flagged as *manual* (no automatable upgrade path) are filtered out of every
listing, so what you see is what `gup update` can act on. A `--provider` id gup cannot act on here
— unknown, or a provider of another OS — gets one warning on stderr
(`Attention : Provider brew-cask indisponible sur Windows (macOS uniquement) — ignoré.`) instead of
scanning nothing in silence; stdout stays clean for `--json`.

## `gup update [targets...]`

With no target and no `--all`, it scans and opens the package picker.

| Flag | Effect |
|---|---|
| `-a, --all` | Take everything the scan found, after a confirmation |
| `-y, --yes` | Skip that confirmation — **and** the retry offer (see below) |
| `-p, --provider <ids...>` | Restrict the scan to these provider ids |
| `--fast` | Skip providers marked `slow` |
| `--timeout <seconds>` | Per-install wall-clock cap; `0` disables it |

Passing explicit targets skips the scan entirely: `gup` goes straight to the provider and asks it
to update that package.

`-y` is the CI switch. Beyond the confirmation it also suppresses the
[retry offer](#retrying-failed-updates), because every retry strategy bypasses an installer
integrity check and that needs a human to say yes.

While the updates run, installers print in your terminal as they would on their own. When
another gup is already updating (a scheduled run, another terminal), `gup update` waits for it
with a message, so two runs never drive the same package managers at once.

### Picking packages

The picker is the interactive app's **Paquets** (packages) table on its own screen: one group per
provider, one checkbox per package, current and target versions in columns.

| Key | Effect |
|---|---|
| `↑↓` `j` `k`, `pgup` `pgdn` | Move |
| `espace`, or a click | Check or uncheck the package; on a provider's row, all of its packages |
| `a` | Check everything shown — or, when it already is, uncheck it (the hint says which: `a tout cocher` / `a tout décocher`) |
| `/` | Filter by name or provider; checked packages stay checked while you filter |
| `entrée`, or a click on the selection bar | Update the **checked** packages — those the filter hides included |
| `q` | Leave without updating (`Aucune sélection.`, exit `0`) |

The selection bar at the bottom counts what is checked (`● 5 sur 12 coché(s)`) and shows the
button `▐ Entrée  Mettre à jour (5) ▌` once something is. **Entrée never updates the row under the
cursor**: with nothing checked it updates nothing and says how to check
(`Cochez au moins un paquet (espace), ou tout cocher avec a.`). To update everything, press `a`
then Entrée; to update one known package without scanning, use `gup update provider:packageId`.

## `gup doctor`

Prints three groups, then a **Système** section:

- **Détectés** — every provider found on this machine;
- **Non installés / hors PATH** — supported here but not found, each with how to install it;
- **Incompatibles avec \<OS\>** — providers of other systems, dimmed, with where they run
  (`macOS uniquement`): gup never probes, scans nor updates them here;
- **Système** — each part of gup reports its own state, with your home directory shortened to `~`:

```text
  Système
  ────────────────────────────────────────
  ● Terminal intégré         disponible — mises à jour dans l'interface
  ● Journal de debug         info (défaut) · ~\AppData\Local\gup\logs
  ○ Planification            aucune planification active
  ● Configuration            ~\AppData\Roaming\gup\config.json — valeurs par défaut (aucun fichier)
```

Detection runs eight probes at a time, each capped at 15 s, so one stuck tool cannot hang the
command. Run it first when a package you expected never shows up in a scan, and attach its output
to a bug report.

## `gup log`

Reads the debug log; it never writes to it. What the log records, its levels and where it lives:
[journal-and-reports.md § Debug log](journal-and-reports.md#debug-log).

| Command | Effect |
|---|---|
| `gup log` / `gup log show` | The newest lines, readable |
| `gup log path` | The log directory, on stdout |
| `gup log export` | A diagnostic `.zip` for a bug report: the log of the period, a machine description, a summary of the activity, a README. Nothing is uploaded |

| `show` flag | Effect |
|---|---|
| `-n, --lines <n>` | Number of lines (default 50) |
| `-l, --level <niveau>` | Minimum level: `error`, `warn`, `info`, `debug`, `trace` |
| `-s, --since <période>` | `7d`, `30d`, `12w`, `6m`, `1y`, `all` or a date `AAAA-MM-JJ` (default `7d`) |
| `-g, --grep <texte>` | Only the lines containing this text |
| `--json` | Raw JSON lines |

| `export` flag | Effect |
|---|---|
| `-s, --since <période>` | The period, as above (default `7d`) |
| `-o, --out <fichier>` | Output file (default: the reports directory) |
| `--force` | Replace the `--out` file if it exists |
| `--no-history` | Leave the activity summary out of the archive |

## `gup report`

Exports the activity history of a period. With no option: the HTML report of the last 12 months,
written to the reports directory and opened in your browser. Everything about the report — its
pages, the text charts, how the numbers are counted, privacy:
[journal-and-reports.md](journal-and-reports.md#activity-journal).

| Flag | Effect |
|---|---|
| `-f, --format <format>` | `html` (default), `text` (charts in the terminal), `json` or `csv` |
| `-s, --since <période>` | `7d`, `30d`, `12w`, `6m`, `1y`, `all` or a date `AAAA-MM-JJ` (default `12m`) |
| `--until <date>` | Last day included, `AAAA-MM-JJ` (default: now) |
| `-o, --out <fichier>` | Write to this file; `-` for the standard output. Without it, HTML goes to the reports directory and the other formats to the standard output |
| `--open` / `--no-open` | Open the HTML report in the browser, or not, whatever Options › **Ouvrir le rapport** says |
| `--force` | Replace the `--out` file if it exists |
| `--delimiter <séparateur>` | CSV separator: `,` (default), `;` or `tab` |

Without `--open` or `--no-open`, the HTML report opens when the setting is on (the default) and
gup runs in a terminal outside CI. Data goes to stdout, notices to stderr. An unopenable browser
leaves the command successful, with the file's address printed.

## `gup schedule`

Updates chosen packages automatically. A schedule names packages (`provider:paquet`), never a
whole provider; while one is enabled, the OS starts a short-lived gup every 15 minutes. How it
runs, recurrences, the OS trigger, troubleshooting: [scheduled-updates.md](scheduled-updates.md).

| Command | Effect |
|---|---|
| `gup schedule add <cibles...> (--every … \| --cron …)` | Create a schedule, then register the OS trigger if it is the first enabled one |
| `gup schedule list [--json]` | Schedules, next and last runs, the trigger's state |
| `gup schedule status [--json]` | The trigger: what is registered, where, from which gup |
| `gup schedule enable <ids...>` / `disable <ids...>` | Switch schedules on or off |
| `gup schedule remove <ids...>` | Delete schedules |
| `gup schedule run-now <id>` | Run a schedule now, in this terminal |
| `gup schedule install [--launcher headless\|direct]` | Register or repair the OS trigger for this gup (`direct`: Windows, without `conhost --headless`) |
| `gup schedule uninstall [--purge]` | Remove the trigger and disable every schedule (`--purge`: delete them and their state too) |

| `add` flag | Effect |
|---|---|
| `--every <fréquence>` | `daily`, `weekly` or `monthly` |
| `--on <jour>` | weekly: `lun`…`dim` (or `mon`…`sun`, `0`–`7`) · monthly: `1` to `28`, or `dernier` / `last` |
| `--at <HH:MM>` | Time of day, local (default `09:00`) |
| `--cron <expression>` | A 5-field cron expression instead, e.g. `"0 9 * * 1-5"` (at most hourly) |
| `--name <nom>` | Name of the schedule |
| `--no-catch-up` | Record a missed run as missed instead of running it at the next opportunity |
| `--disabled` | Create it switched off |

An `<id>` is the 8-character id `list` shows, or a unique prefix of at least 4 characters.

## Interactive app

`gup` with no subcommand opens a full-screen app: a menu on the left (**Scan**, **Paquets**,
**Planification**, **Providers**, **Journal**, **Options**), the view in front on the right, the
keys that apply at the bottom. Check packages in **Paquets** and press Entrée: the update runs
inside the app, each install in a live terminal pane, then you land back on the table. Every view
and every key: [interactive-app.md](interactive-app.md).

## Targeting a package

Targets are `provider:packageId`.

- **Provider id** — the parenthesised id in `gup doctor` (`winget`, `npm-g`, `pip`, `vscode-ext`…).
- **Package id** — the provider's own identifier, which is **not always what the table shows**.
  The table prints a display name when the provider supplies one: winget shows `Spotify`, but the
  id to target is `Spotify.Spotify`. When in doubt, `gup list --json` gives you both.

A target without a `:` exits `2` and prints the accepted forms. Passing a provider *name* where a
package id belongs is detected and answered with the commands that would have worked:

```bash
gup update winget
# Format invalide: "winget". Attendu provider:packageId
# "winget" est un nom de provider, pas un identifiant de paquet.
# Pour ce provider, essaie :
#   gup list --provider winget
#   gup update --provider winget --all
#   gup                            # menu interactif
```

A provider gup does not know, or one of another OS, exits `2` too:
`Provider brew-cask indisponible sur Windows (macOS uniquement)`.

## Fast mode

36 of the 153 providers are marked `slow`: their scan does per-package HTTP lookups or walks the
filesystem. `--fast` skips them; in the interactive app, Options › **Mode rapide** does the same.

That set is the WSL bridge, the editor-extension providers (VS Code, Cursor, Windsurf, VSCodium,
JetBrains), `pwsh-modules`, the toolchain and version managers, `self`, and everything that
resolves versions over a releases feed. The flag is declarative — each provider carries its own
`slow` flag, there is no central list to keep in sync.

## Skipping stuck installs

An install can hang: a stalled download, the Windows Installer mutex, an installer that drops its
`--silent` flag and waits on a now-visible dialog. `gup` will not block forever.

- **Ctrl+C** during a batch skips the install in flight and moves on (`s` in the app's run view).
- **Ctrl+C twice** within 1.5 s stops the whole batch after the current package.
- A per-install **wall-clock timeout** kills a wedged install automatically. Default
  **1200 s (20 min)**. Change it with `--timeout <seconds>`, the `GUP_INSTALL_TIMEOUT` environment
  variable, or Options › **Timeout install** — in that order of precedence. `0` disables it.

Both levers produce a skip (`↷ ignorée par l'utilisateur`), not a failure: the summary counts them
apart, and they are never offered for retry — you skipped them on purpose.

Outside an update batch (at a prompt, between packages) Ctrl+C keeps its usual meaning and exits.

## Retrying failed updates

When a provider marks a failure as *retryable* — installer hash mismatch, a locale-specific
manifest, a running application, a changed installer technology — `gup` offers a retry pass at the
end of the batch. Strategies are proposed in increasing order of aggressiveness, and each one is
offered only once:

| Strategy | What it does | Risk |
|---|---|---|
| `--force` | Reinstalls while ignoring the installer hash | Skips integrity verification |
| `--force --uninstall-previous` | Removes the installed version first, then installs | **Destructive** — app config outside `%APPDATA%` may be lost |
| uninstall + install | Runs the two commands separately, bypassing the upgrade chain entirely | **Destructive**, same caveat |

Declining leaves the failures as they are. `-y` skips the offer entirely, and scheduled runs never
retry: no integrity check is ever bypassed without an explicit answer.

## Elevated updates

Packages that need administrator rights are detected **at scan time**, not when the install fails.
Instead of letting each one hit you with its own prompt, `gup` groups them and runs a single
elevated batch after the others, then folds the results back into the summary. The interactive app
does the same.

- **Windows:** one UAC prompt; the batch installs in its own administrator window.
- **macOS and Linux:** packages whose update needs `sudo` (MacPorts, Fink, pkgin, the apt/dnf
  delegations) share one `sudo` batch: the password is asked once, not once per package.

Declining the elevation marks the whole batch skipped — a deliberate choice, not a crash. The
elevated part is a pure executor that never reads your settings; your own gup process records the
results, so they land in the profile of the user who invoked `gup`.

## JSON output

`gup list --json` writes a `ProviderScanResult[]` to stdout and nothing else — no screen, no
table — so the payload stays pipeable.

```json
[
  {
    "providerId": "winget",
    "available": true,
    "packages": [
      {
        "id": "Spotify.Spotify",
        "name": "Spotify",
        "current": "1.2.93.667.g7b5cc0ce",
        "latest": "1.2.95.453.g0eeebbed"
      }
    ]
  }
]
```

| Field | Type | Notes |
|---|---|---|
| `providerId` | `string` | The id you pass to `--provider` and in a target |
| `available` | `boolean` | Always `true`: only scanned providers appear. Use `gup doctor` for the rest |
| `packages[].id` | `string` | The identifier to target in `gup update` |
| `packages[].name` | `string?` | Display name, when the provider has one |
| `packages[].current` / `.latest` | `string` | Versions as the provider reports them, verbatim |
| `packages[].note` | `string?` | Free-form annotation (`pinned`, `source: msstore`…) |
| `packages[].requiresAdmin` | `boolean?` | Will go through the elevated batch |
| `packages[].aggregate` | `boolean?` | Updating it updates the whole provider (never a scheduling target) |
| `error` | `string?` | Set when the provider was reachable but its scan failed |

A provider that fails to scan yields an entry with an `error` and an empty `packages` array — it
never aborts the run. Warnings always go to stderr, so they cannot corrupt the payload.

Other JSON outputs: `gup report --format json` (the history of a period, English snake_case
fields, `"schema": "gup.history-export/1"`), `gup schedule list --json` and `status --json`
([example](scheduled-updates.md#commands)), `gup log --json` (one record per line).

## Environment variables

| Variable | Effect |
|---|---|
| `GUP_INSTALL_TIMEOUT` | Per-install wall-clock cap, in seconds. Default `1200`; `0` disables it. `--timeout` wins over it; it wins over the settings file |
| `GUP_HISTORY` | `0`, `false`, `off` or `no` turns the activity history off |
| `GUP_HISTORY_DIR` | Writes the history somewhere else |
| `GUP_CONFIG` | `0`, `false`, `off` or `no`: run on defaults, never read or write the settings file |
| `GUP_CONFIG_DIR` | Keep `config.json` in another directory |
| `GUP_LOG_LEVEL` | The debug log's level (`off` writes nothing). `--log-level` wins over it; it wins over the settings file |
| `GUP_LOG_DIR` | Writes the debug log somewhere else |
| `GUP_LOG_RETENTION_DAYS` | Days of debug log kept, `1` to `365` (default `14`) |
| `GUP_REPORT_DIR` | Where reports and diagnostic archives go by default |
| `GUP_SCHEDULER_DIR` | Keep the schedules and their state somewhere else (the OS trigger only sees it if it is set in your login environment) |
| `GUP_PTY` | `0`, `false`, `off` or `no`: no embedded terminal — updates started from the app run in your terminal |
| `GUP_ASCII` | `1`: ASCII symbols and borders when Options › **Symboles** is `auto` (automatic on `TERM=linux` or `dumb`, and on macOS/Linux without a UTF-8 locale) |
| `NO_COLOR` | Any non-empty value: no colour, in the screens (monochrome) and in console output ([no-color.org](https://no-color.org)) |

Set by gup itself, not for you to set: `GUP_NONINTERACTIVE=1` (a scheduled run: every prompt fails
fast). Used by gup's own test suites only: `GUP_E2E`, `GUP_E2E_SCOPE`, `GUP_MUTATE`
([testing.md](../development/testing.md)).

## Exit codes

| Code | Meaning |
|---|---|
| `0` | Success, or nothing to do |
| `1` | At least one update failed, the `--all` confirmation was declined, a file could not be read or written, a schedule's trigger could not be changed, or an unhandled error occurred (`Error: …` on stderr) |
| `2` | Bad invocation: malformed target, unknown or foreign provider, invalid `--timeout`, `--log-level`, `--since`, `--format` or schedule arguments — nothing was changed |
| `130` | Ctrl+C at a prompt or on a full screen |
| `128 + n` | Signal `n` while a full screen was up (the console window closed, Ctrl+Break, a kill): the terminal is restored first |

| Command | Codes |
|---|---|
| `gup` | `0` on quit; `1` when the app cannot start (no interactive terminal, Node older than 26.9) |
| `gup list`, `gup doctor` | `0` — a provider that fails to scan is reported in-band, not as a process failure |
| `gup update` | `0`, `1` (a failure, a declined `--all`), `2` |
| `gup log`, `gup report` | `0` (a report written but not opened is a success), `1`, `2` |
| `gup schedule` | `0`, `1` (the trigger could not be changed, or a `run-now` had failures — schedules are always saved first), `2` |

## Activity history

Every scan and every update attempt is appended to a local history — one JSON line per event,
nothing sent anywhere. It is read back only to be shown and exported: the **Journal** view, `gup
report`, the HTML report. Nothing in it ever decides what gup updates. Locations, format, privacy
and how to turn it off (`GUP_HISTORY=0`):
[journal-and-reports.md § Activity history](journal-and-reports.md#activity-history).
