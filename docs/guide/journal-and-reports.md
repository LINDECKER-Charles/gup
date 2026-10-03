# Journal and reports

gup keeps two local records of what it does, both on your machine only — nothing is ever sent
anywhere:

- the **activity history**: every scan and every update attempt, one line each (see
  [Activity history](cli-reference.md#activity-history));
- the **debug log**: what gup did step by step — the commands it ran, their exit codes, the
  updates it attempted — to understand a failure or to attach to a bug report.

This page covers the debug log.

- [Debug log](#debug-log)
  - [What it records](#what-it-records)
  - [Levels](#levels)
  - [Reading it: `gup log`](#reading-it-gup-log)
  - [Sending it with a bug report: `gup log export`](#sending-it-with-a-bug-report-gup-log-export)
  - [Where it lives](#where-it-lives)
  - [Privacy](#privacy)

## Debug log

### What it records

Every gup run — the menu, `gup update`, `gup list`, a scheduled run — appends to the log of the
day:

| Event | When |
|---|---|
| `session.start` / `session.end` | the run starts (command, what started it, versions, platform) / ends (exit code, duration) |
| `session.crash` | gup stopped on an unexpected error (message and stack) |
| `cmd.start` / `cmd.end` | a command gup ran: a probe (`npm outdated`, `winget --version`…) or an install, with its exit code, its duration and, when it failed, the end of its error output |
| `update.start` / `update.end` | an update attempt and its outcome |
| `update.planned`, `elevation.batch`, `update.cancelled`, `update.waiting` | the shape of an update run: what was planned, what needed administrator rights, what a stop cancelled, a wait on another gup run |
| `history.write-failed` | the activity history could not be written, and why |

Each line names the provider and the package it belongs to, so the commands of a scan of eight
providers at once stay readable.

### Levels

| Level | Records |
|---|---|
| `off` | nothing — no file is even created |
| `error` | crashes |
| `warn` | + failed installs and updates |
| `info` (default) | + sessions, installs, update attempts |
| `debug` | + every probe a scan runs, with the error output of the failed ones |
| `trace` | + the start of every probe and the end of its output |

Choose it for one run with `--log-level`, or for every run with `GUP_LOG_LEVEL`:

```bash
gup --log-level debug                 # the menu, with every probe logged
gup update --all --log-level debug    # the flag also works after the command
GUP_LOG_LEVEL=off gup list            # no log at all
```

`--log-level` wins over `GUP_LOG_LEVEL`, which wins over the default. A scheduled run logs at
least `info` whatever the level says (unless it is `off`): nobody watches it, the log is all
that is left of it. `gup doctor` shows the level in effect and where it came from:

```
  Système
  ────────────────────────────────────────
  ● Journal de debug         info (défaut) · ~\AppData\Local\gup\logs
```

### Reading it: `gup log`

```bash
gup log                       # the last 50 lines of the last 7 days
gup log -n 200 -l warn        # the last 200 warnings and errors
gup log --since 2026-10-01    # since a date (also 7d, 12w, 6m, 1y, all)
gup log --grep winget         # lines that mention winget
gup log --json                # raw JSON lines, for a script
gup log path                  # the log directory
```

```
03/10 14:22:05.130  INFO   cmd.start      [winget] winget upgrade --id Git.Git -e --silent
03/10 14:22:23.512  INFO   cmd.end        [winget] winget upgrade --id Git.Git -e --silent · exit 0 · 18,4 s
03/10 14:22:23.540  DEBUG  cmd.end        [az] az version · exit 1 · 0,4 s · ERROR: Please run 'az login'
```

Reading the log never writes to it.

### Sending it with a bug report: `gup log export`

```bash
gup log export                         # the last 7 days
gup log export --since 30d --out gup-diagnostic.zip
```

```
  archive de diagnostic : C:\Users\you\AppData\Local\gup\reports\gup-diagnostic-20261003-142205.zip
  relisez-la avant de la partager : les secrets connus sont masqués, les chemins abrégés en ~
```

The archive holds:

- `logs/` — the log files of the period (up to 50 MB, newest first), redacted again;
- `system.json` — gup, Node and OS versions, whether a terminal was attached, and gup's own
  environment variables (a fixed list: the rest of your environment is never copied);
- `README.txt` — what is inside, and what was removed.

It is written to the reports directory (the 20 newest archives are kept) or to `--out`; an
existing `--out` is only replaced with `--force`. **Open it and read it before you share it.**

### Where it lives

| Platform | Directory | Override |
|---|---|---|
| Windows | `%LOCALAPPDATA%\gup\logs` | `GUP_LOG_DIR` |
| macOS | `~/Library/Logs/gup` (visible in Console.app) | `GUP_LOG_DIR` |
| Linux | `$XDG_STATE_HOME/gup/logs` (else `~/.local/state/gup/logs`) | `GUP_LOG_DIR` |

One file per day (`gup-2026-10-03.jsonl`, UTC date), split into parts past 10 MB
(`gup-2026-10-03.1.jsonl` …). Once a day has ten files, only errors are written until midnight
UTC. Files older than 14 days are deleted when gup starts writing; `GUP_LOG_RETENTION_DAYS`
(1 to 365) changes that. Diagnostic archives go to the reports directory
(`%LOCALAPPDATA%\gup\reports`, `~/Library/Application Support/gup/reports`,
`$XDG_STATE_HOME/gup/reports`; override `GUP_REPORT_DIR`).

### Privacy

- Known secret shapes are masked before anything is written: credentials in URLs; the value of
  any setting, variable or query parameter named like a secret (`password=`, `NPM_TOKEN=`,
  `.npmrc`'s `_authToken=`, `AWS_SECRET_ACCESS_KEY=`, Azure `AccountKey=`, `?sig=` of a SAS
  link, `"client_secret": "…"`); `Authorization` headers and `Bearer …` values;
  GitHub/npm/GitLab/Slack/PyPI/NuGet tokens, AWS and Google keys, JWTs, private keys; the values
  of `--token`/`--password` flags. Your home directory is shortened to `~`.
- `gup log` drops the escape sequences a tool may have printed: a log line never changes your
  terminal's colours, title or clipboard.
- The environment is never copied wholesale: only gup's own variables and the terminal's name.
- With administrator rights (the elevated batch), gup writes nothing to your log directory: the
  elevated part hands its lines back, and your own gup process checks and writes them.
- The log and the archives are private to your user (mode `0600` on macOS and Linux).
- A secret in a format gup does not know can still slip through: read an archive before sharing.
