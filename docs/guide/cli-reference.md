# CLI reference

`gup` on its own opens the interactive menu. The subcommands (`list`, `update`,
`doctor`) bypass it and are what you script against.

- [Commands](#commands)
- [Interactive menu](#interactive-menu)
- [Targeting a package](#targeting-a-package)
- [Fast mode](#fast-mode)
- [Skipping stuck installs](#skipping-stuck-installs)
- [Retrying failed updates](#retrying-failed-updates)
- [Elevated updates](#elevated-updates)
- [JSON output](#json-output)
- [Environment variables](#environment-variables)
- [Exit codes](#exit-codes)
- [Activity history](#activity-history)

> **CLI output is French.** That is deliberate: the interface language is
> French, the documentation language is English. See the language rule in
> [`CONTRIBUTING.md`](../../CONTRIBUTING.md#7-code-style).

## Commands

```bash
gup                                                  # interactive menu
gup list                                             # list outdated packages
gup list --fast                                      # skip the slow scans
gup list --provider winget npm-g                     # restrict to some providers
gup list --json                                      # pipeable JSON output
gup update                                           # interactive selection
gup update --all -y                                  # everything, no prompt (CI)
gup update winget:Spotify.Spotify npm-g:typescript   # specific targets
gup update --all --timeout 300                       # auto-skip installs over 5 min
gup doctor                                           # detected vs missing providers
gup --version                                        # print the version
```

### `gup list`

Scans and prints the outdated packages as a colorized table. Read-only: it
never installs anything.

| Flag | Effect |
|---|---|
| `-p, --provider <ids...>` | Restrict the scan to these provider ids |
| `--fast` | Skip providers marked `slow` — see [Fast mode](#fast-mode) |
| `--json` | Raw JSON on stdout, no spinner, no table |

Packages a provider flagged as *manual* (no automatable upgrade path) are
filtered out of every listing, so what you see is what `gup update` can act on.

### `gup update [targets...]`

With no target and no `--all`, it scans and opens the multi-select picker.

| Flag | Effect |
|---|---|
| `-a, --all` | Take everything the scan found, after a confirmation |
| `-y, --yes` | Skip that confirmation — **and** the retry prompt (see below) |
| `-p, --provider <ids...>` | Restrict the scan to these provider ids |
| `--fast` | Skip providers marked `slow` |
| `--timeout <seconds>` | Per-install wall-clock cap; `0` disables it |

Passing explicit targets skips the scan entirely: `gup` goes straight to the
provider and asks it to update that package.

`-y` is the CI switch. Beyond the confirmation it also suppresses the
[retry prompt](#retrying-failed-updates), because every retry strategy bypasses
an installer integrity check and that needs a human to say yes.

### `gup doctor`

Prints every provider detected on the machine, then the ones that are missing
or off `PATH` with a hint on how to install them. Run it first when a package
you expected never shows up in a scan.

## Interactive menu

`gup` with no subcommand scans once, then loops on a menu.

| Action | Effect |
|---|---|
| **Scan** | Rescan every provider |
| **Review** | Print the detailed table of the last scan |
| **Update selected** | Multi-select picker, then confirm |
| **Update all** | Everything from the last scan, after confirmation |
| **Update target** | Prompts for `provider:packageId` (space- or comma-separated) |
| **Providers** | Same output as `gup doctor` |
| **Options** | Fast mode, provider filter, install timeout |
| **Quit** | Exit `0` |

The **Options** screen holds the same three knobs the flags expose. Fast mode
and the provider filter change what the *next* scan looks at, so rescan to
apply them; the timeout applies to the next install immediately.

## Targeting a package

Targets are `provider:packageId`.

- **Provider id** — the parenthesised id in `gup doctor` (`winget`, `npm-g`,
  `pip`, `vscode-ext`…).
- **Package id** — the provider's own identifier, which is **not always what
  the table shows**. The table prints a display name when the provider supplies
  one: winget shows `Spotify`, but the id to target is `Spotify.Spotify`. When
  in doubt, `gup list --json` gives you both.

A target without a `:` exits `2` and prints the accepted forms. Passing a
provider *name* where a package id belongs is detected and answered with the
commands that would have worked:

```bash
gup update winget
# Format invalide: "winget". Attendu provider:packageId
# "winget" est un nom de provider, pas un identifiant de paquet.
# Pour ce provider, essaie :
#   gup list --provider winget
#   gup update --provider winget --all
```

## Fast mode

36 of the 153 providers are marked `slow`: their scan does per-package HTTP
lookups or walks the filesystem. `--fast` skips them.

That set is the WSL bridge, the editor-extension providers (VS Code, Cursor,
Windsurf, VSCodium, JetBrains), `pwsh-modules`, the toolchain and version
managers, `self`, and everything that resolves versions over a releases feed.
The flag is declarative — each provider carries its own `slow` flag, there is
no central list to keep in sync.

## Skipping stuck installs

An install can hang: a stalled download, the Windows Installer mutex, an
installer that drops its `--silent` flag and waits on a now-visible dialog.
`gup` will not block forever.

- **Ctrl+C** during a batch skips the install in flight and moves on.
- **Ctrl+C twice** within 1.5 s stops the whole batch after the current package.
- A per-install **wall-clock timeout** kills a wedged install automatically.
  Default **1200 s (20 min)**. Change it with `--timeout <seconds>`, the
  `GUP_INSTALL_TIMEOUT` environment variable, or *Options → Timeout install*.
  `0` disables it.

Both levers produce a `SKIP`, not a failure: the summary counts them apart, and
they are never offered for retry — you skipped them on purpose.

Outside an update batch (at a prompt, between packages) Ctrl+C keeps its usual
meaning and exits.

## Retrying failed updates

When a provider marks a failure as *retryable* — installer hash mismatch, a
locale-specific manifest, a running application, a changed installer technology
— `gup` offers a retry pass at the end of the batch. Strategies are proposed in
increasing order of aggressiveness, and each one is offered only once:

| Strategy | What it does | Risk |
|---|---|---|
| `--force` | Reinstalls while ignoring the installer hash | Skips integrity verification |
| `--force --uninstall-previous` | Removes the installed version first, then installs | **Destructive** — app config outside `%APPDATA%` may be lost |
| uninstall + install | Runs the two commands separately, bypassing the upgrade chain entirely | **Destructive**, same caveat |

Declining leaves the failures as they are. `-y` skips the prompt entirely: no
integrity check is ever bypassed without an explicit answer.

## Elevated updates

Packages that need administrator rights are detected **at scan time**, not when
the install fails. Instead of letting each one hit you with its own prompt,
`gup` groups them and runs a single elevated batch behind one UAC prompt, then
folds the results back into the normal summary.

Declining the elevation marks the whole batch `SKIP` — a deliberate choice, not
a crash. The elevated child is a pure executor: history is written by the
parent process, so records land in the profile of the user who invoked `gup`.

## JSON output

`gup list --json` writes a `ProviderScanResult[]` to stdout and nothing else —
the spinner is suppressed so the payload stays pipeable.

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
| `error` | `string?` | Set when the provider was reachable but its scan failed |

A provider that fails to scan yields an entry with an `error` and an empty
`packages` array — it never aborts the run. Warnings always go to stderr, so
they cannot corrupt the payload.

## Environment variables

| Variable | Effect |
|---|---|
| `GUP_INSTALL_TIMEOUT` | Per-install wall-clock cap, in seconds. Default `1200`; `0` disables it. `--timeout` takes precedence |
| `GUP_HISTORY` | `0`, `false`, `off` or `no` turns the activity history off |
| `GUP_HISTORY_DIR` | Writes the history shards somewhere else |

## Exit codes

| Code | Meaning |
|---|---|
| `0` | Success, or nothing to do |
| `1` | At least one update failed, the `--all` confirmation was declined, or an unhandled error occurred |
| `2` | Bad invocation: malformed target, unknown provider, invalid `--timeout` |
| `130` | Ctrl+C at a prompt |

`gup list` and `gup doctor` always exit `0` — a provider that fails to scan is
reported in-band, not as a process failure.

## Activity history

Every scan and every update attempt is appended to a local JSONL log. It exists
to answer "what did this machine do, and when" — nothing reads it back, so it
can never influence an upgrade.

| Platform | Location |
|---|---|
| Windows | `%LOCALAPPDATA%\gup\history\` |
| macOS | `~/Library/Application Support/gup/history/` |
| Linux / other | `$XDG_STATE_HOME/gup/history/`, else `~/.local/state/gup/history/` |

One file per UTC month (`2026-08.jsonl`), one self-describing JSON object per
line, never rewritten:

```json
{"v":1,"ts":"2026-08-08T15:10:22.417Z","runId":"…","gup":"0.3.0","platform":"win32","kind":"update","providerId":"winget","packageId":"Spotify.Spotify","status":"success","from":"1.2.93.667.g7b5cc0ce","to":"1.2.95.453.g0eeebbed","durationMs":18420}
```

`kind` is `scan` or `update`; `status` is `success`, `failed` or `skipped` —
the three are kept apart, which is the whole point of logging them. Records
carry no credential, no path outside the history directory, and nothing is sent
anywhere.

Disable it with `GUP_HISTORY=0`. If the log cannot be written (read-only
profile, full disk) `gup` prints one dimmed warning on stderr and carries on:
an update must never fail because of its own bookkeeping.
