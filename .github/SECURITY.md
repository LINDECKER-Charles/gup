# Security

[![Security](https://github.com/LINDECKER-Charles/gup/actions/workflows/security.yml/badge.svg)](https://github.com/LINDECKER-Charles/gup/actions/workflows/security.yml)
[![CodeQL](https://img.shields.io/badge/CodeQL-security--extended-2ea44f?logo=github)](https://github.com/LINDECKER-Charles/gup/actions/workflows/security.yml)
[![Semgrep](https://img.shields.io/badge/semgrep-p%2Ftypescript%20%2B%20p%2Fnodejs-1B4965?logo=semgrep&logoColor=white)](https://github.com/LINDECKER-Charles/gup/actions/workflows/security.yml)
[![Gitleaks](https://img.shields.io/badge/gitleaks-enabled-000?logo=gitleaks)](https://github.com/LINDECKER-Charles/gup/actions/workflows/security.yml)
[![Dependabot](https://img.shields.io/badge/dependabot-weekly-025E8C?logo=dependabot&logoColor=white)](https://github.com/LINDECKER-Charles/gup/blob/main/.github/dependabot.yml)

## Supported versions

| Version | Supported |
|---|---|
| Latest published minor release (the version `npm i -g @charles_lindecker/gup` installs) | ✅ Security fixes, shipped as a patch release |
| Any older release | ❌ Upgrade to the latest release |

While `gup` is in `0.x`, fixes are made on the latest minor line only. The
supported runtime is the one `engines.node` allows (Node ≥ 26.9); a problem
that only reproduces on an older Node is not supported.

## Reporting a vulnerability

Report it privately through GitHub's
[private vulnerability reporting](https://github.com/LINDECKER-Charles/gup/security/advisories/new)
(*Security* tab → *Report a vulnerability*). Only the repository's
maintainers see the report.

**Please do not open a public issue, pull request or discussion** for a
vulnerability, and do not include a reproducer anywhere public before a fix is
released.

Include what you can of:

- the affected version(s) of `gup` (`gup --version`), the OS and `node --version`;
- the impact: what an attacker gains, and what they need to control first;
- steps or a proof of concept that reproduce it;
- a suggested fix, if you have one.

## What happens next

`gup` has a single maintainer, so these are best-effort aims, not contractual
commitments:

| Step | Aim |
|---|---|
| Acknowledge the report | within 7 days |
| Assess it: confirmed or not, severity, affected versions | within 14 days |
| Release a fix for a high or critical issue, as a patch release | within 30 days of the assessment |

Lower-severity issues are fixed in a regular release. Disclosure is
coordinated: the GitHub security advisory is published together with the fixed
release (with a CVE when one is warranted), and you are credited in it unless
you prefer not to be.

## Scope

In scope:

- `gup`'s own code, as published on npm, including its dependencies as
  shipped (the optional `node-pty` included);
- how it starts processes: command or argument injection, a package id or
  version from an upstream tool reaching a shell, an update routed to the
  wrong package manager, the elevated batch, the embedded terminal;
- its network access (upstream version probes);
- what it shows: tool output drawn in the interactive app, the journal and
  `gup log`, and the HTML report it generates;
- the OS trigger it registers for scheduled updates;
- every file `gup` itself writes under your profile: the activity history,
  the debug log, reports and diagnostic archives, the settings file, the
  schedules and their state.

Out of scope:

- vulnerabilities in the package managers `gup` drives, or in the packages
  they install: report those upstream;
- the terminal emulator `gup` runs in, and the browser that opens a report;
- attacks that need write access to your user profile or to a directory on
  your `PATH`: an attacker with that access already runs code as you;
- social engineering.

## Threat model

`gup` is a CLI that scans the installed package managers and shells out to
them to perform upgrades — from a full-screen app, from scripts, or unattended
from a scheduled task. The risks, in the order they matter:

### 1. Command injection

A hostile upstream manifest or registry response could carry shell
metacharacters or option-like text in a package id.

- Every process starts in `src/core/runner.ts`: `execa` with an argv vector,
  never a shell. `sanitizeCommand` and `sanitizeArgs` refuse option-like or
  shell-like values before anything spawns; a refused package fails on its
  own (`refused by the safety barrier: …`) and the batch goes on.
- The one provider that needs `shell: true` (Scoop's PowerShell shim) is
  pinned by allowlist, behind a strict package-id pattern.
- A bare command name is looked up on the `PATH` only, never in the working
  directory: on Windows the runner sets `NoDefaultCurrentDirectoryInExePath`
  before any spawn, so `gup` started from a folder holding a planted
  `npm.cmd` or `net.exe` still runs the real tool — and so does the cmd.exe
  behind a `.cmd` shim, which inherits the switch
  (`tests/integration/runner-cwd-lookup.test.ts`).
- An install in the embedded terminal is started by the same runner: node-pty
  only ever starts gup's trampoline (`dist/pty-exec.js`) with a constant
  command line and one base64url payload, which the trampoline validates and
  hands back to `runInherit` — so the sanitisers run twice.
- Pinned by `tests/security/command-injection.test.ts`, `shell-usage.test.ts`,
  `process-chokepoints.test.ts` (no `child_process` or `execa` outside the
  runner, node-pty spawned only by `PtySession`).

### 2. MITM on upstream version probes

Every `fetch()` target is `https://`, bounded by a 5 s timeout. Pinned by
`tests/security/http-targets.test.ts`.

### 3. Provider mis-routing

`inferSourceFromPath` decides which package manager owns a binary; a
misclassification would drive the wrong upgrade. Pinned by
`tests/security/install-source.test.ts`. A provider foreign to the running OS
is never probed nor run: on macOS, a `winget` shim on the `PATH` cannot light
up the winget provider (`tests/core/platform/platform-gate-source.test.ts`).

### 4. Hostile text shown by gup

Package ids, versions and messages come from upstream tools.

- **In the terminal**, they are cell text. The history and the debug log are
  read back without the escape sequences and control characters a tool
  printed, so the Journal and `gup log` never change your terminal's colours,
  title or clipboard.
- **In the embedded terminal**, an installer's output is interpreted by gup's
  terminal emulator inside the pane, never written raw to your terminal: its
  screen clears and cursor moves stay inside the pane. Keys reach an installer
  only after an explicit `t` or click, never while a dialog is open, and
  `Ctrl+G` is never forwarded.
- **In the HTML report**, the history travels as JSON in
  `<script type="application/json">` blocks (escaped so it cannot close the
  block), and the page builds its DOM node by node with an attribute
  allowlist: a package name that looks like markup is shown as text. The page
  runs only its own script and stylesheet — CSP `default-src 'none'`,
  `script-src` and `style-src` by SHA-256 hash, `require-trusted-types-for
  'script'` — loads nothing, and names no URL in its script. A test lints the
  shipped script for sinks (`innerHTML`, `eval`…) and recomputes the hashes.
- **Exports**: a CSV cell that starts like a spreadsheet formula is prefixed
  with `'`.

### 5. Elevation

Packages that need administrator rights run in **one** elevated batch, behind
one UAC prompt or one `sudo` password.

- The elevated child (`gup __admin-batch`) is a pure executor: it reads its
  targets from a private file (`mkdtemp` directory, `wx`), calls each
  provider's `update()`, and writes the outcomes back; the unelevated parent
  validates them. Windows starts it with `Start-Process -Verb RunAs` from a
  constant script, its paths passed as arguments, never as code woven into
  it. Start-Process joins its arguments with spaces and quotes nothing, so
  the script wraps each path in double quotes, and a path that cannot be
  quoted (a `"`, a trailing `\`) is refused: a path with a space never
  reaches the elevated node split in two
  (`tests/integration/uac-launcher.test.ts`).
- It runs only the CLI modules that opt in and **never reads the settings
  file**: a file you can write must not steer a process running as
  administrator. Its install timeout, log level and language come from the
  parent's payload, bounded and validated: a payload naming a language gup
  does not speak is refused.
- It never writes into your log directory (CWE-59): its log lines travel back
  with its outcomes, and the parent re-checks and writes them.
- Retry strategies that bypass an installer's integrity check (`--force`,
  `--uninstall-previous`, reinstall) are only ever run on an explicit answer;
  `-y` and scheduled runs never retry (`tests/security/retry-consent.test.ts`).

### 6. Unattended execution (schedules)

A scheduled update runs with nobody watching.

- **Least privilege.** One per-user OS trigger: a Task Scheduler task in your
  logon session (`InteractiveToken`, `LeastPrivilege`, no stored password),
  a launchd agent in `gui/<uid>`, or a block in your own crontab. Registering
  under `sudo` or as root is refused. It exists only while a schedule is
  enabled, and the interactive app registers it only after you consent.
- **Never elevated, never forced, never prompting.** A package that needs
  administrator rights is skipped with the reason; providers whose every
  update needs one cannot be scheduled; installers get no keyboard (winget
  runs with `--disable-interactivity`).
- **Never a whole provider.** Targets are explicit `provider:package` ids,
  validated when a schedule is saved and again at every run; a scan row that
  stands for the whole provider is skipped even when a hand-edited file names
  it. A tampered `schedules.json` can only select among rows the provider
  itself reports outdated: the id handed to `update()` is the scan's.
- **What is registered.** The realpath'd node and gup entry, by absolute path,
  identity-checked (npx caches, temporary directories, sources and WSL paths
  refused); system binaries (`schtasks`, `conhost`, `launchctl`) by absolute
  path. The task XML, plist and crontab line come from pure builders that
  escape their text and refuse characters the format would re-interpret; an
  unreadable crontab is never overwritten. The environment recorded for
  launchd and cron is an allowlist, never credentials.
- Pinned by `tests/security/scheduler-injection.test.ts` and the artefact
  syntax tests.

### 7. Native code

OpenTUI's renderer (loaded through `node:ffi`) and the optional `node-pty` are
pinned exactly; the lockfile, `audit-ci` and Dependabot cover them. node-pty's
own `kill()` is never called (`process-chokepoints.test.ts` forbids it in
`src`, `tests` and `scripts`); each session releases its pseudo-console
through internals checked against the pinned version — another version is
reported unavailable rather than used. On macOS, gup makes node-pty's
`spawn-helper` executable only when the file belongs to you. Without node-pty,
updates run in your terminal as before. Installing it reviews one install
script: see [installation](../docs/guide/installation.md#npm-11-and-install-scripts).

### 8. Local data

What gup writes stays under your profile and never leaves the machine unless
you send it.

- **Files.** History, debug log, reports, settings and schedules live in your
  own state and config directories, under the per-user `%LOCALAPPDATA%` /
  `%APPDATA%` permissions on Windows. On macOS and Linux the history, debug
  log, reports, settings and schedules are created owner-only (`0700`
  directories, `0600` files). Settings and schedules are
  written atomically (temporary file, then rename); exports are created with
  `wx` and replace a file only with `--force`; retention only deletes files
  whose names match gup's own patterns, never through a link.
- **Redaction.** Before anything reaches the debug log, known secret shapes
  are masked — credentials in URLs, values named like secrets (`password=`,
  `NPM_TOKEN=`, `.npmrc`'s `_authToken=`, `AWS_SECRET_ACCESS_KEY=`, Azure
  `AccountKey=`, SAS `sig=`), `Authorization` headers, GitHub, npm, GitLab,
  Slack, PyPI and NuGet tokens, AWS and Google keys, JWTs, private keys — in
  keys and values, with linear-time patterns; the home directory is shortened
  to `~`. History messages are masked when written; every export (JSON, CSV,
  HTML report, diagnostic archive) is redacted again on the way out; the
  diagnostic archive copies the environment through an allowlist only and asks
  you to review it before sharing.
- **Read back, never trusted.** The history is read back only to be displayed
  and exported, never to decide an update:
  `tests/security/history-read-only.test.ts` pins the import graph. A
  tampered or damaged history can mislead a chart, never an upgrade; a damaged
  line is counted and skipped.
- **Settings are data.** Parsed field by field from the file's own keys;
  prototype-polluting names are dropped; a wrong value falls back to its
  default; a corrupt file is moved aside, never deleted. No setting holds a
  command or a path to run. Disable the file with `GUP_CONFIG=0`, the history
  with `GUP_HISTORY=0`, the debug log with `GUP_LOG_LEVEL=off`.
- **Opening a report** uses the platform's own opener — `explorer.exe` by
  absolute path, `/usr/bin/open`, `xdg-open` (`wslview` under WSL) — through the
  runner, detached, never a shell; a relative path, or a path with a comma or
  a quote (which `explorer.exe` would split), is never handed to it.

### 9. Terminal integrity

- Nothing is written to your terminal while a full screen is mounted; gup's
  own lines are deferred to its exit.
- Closing the console window, Ctrl+Break or a kill while a screen is up stops
  the install in flight, restores the terminal and exits with 128 + the signal
  number. The update lock is an OS-released handle, so it never outlives the
  process.
- gup reads the terminal's palette (OSC 4/10/11) through OpenTUI, bounded and
  settled before the screen is torn down, so no late answer lands in your
  shell; it never changes the terminal's palette or background.

## Local security checks

```bash
npm run security        # audit + eslint-security + security tests
npm run audit:deps:ci   # dependency vulnerabilities (audit-ci)
npm run lint:security   # eslint-plugin-security
npm run test:security   # vitest security suite
```

## Automated checks (CI)

`.github/workflows/security.yml` runs on every PR + weekly cron:

- **unit-and-lint**: `lint:security` + `test:security`
- **dependency-audit**: `audit-ci` against the npm advisory db
- **codeql**: GitHub's `javascript-typescript` extended + quality queries
- **semgrep**: custom rules in `.github/semgrep.yml` plus `p/typescript` and
  `p/nodejs` community packs
- **gitleaks**: secret scanning with config `.gitleaks.toml`

Dependabot (`.github/dependabot.yml`) opens grouped weekly PRs for npm + GH
Actions updates.

`.github/workflows/docs.yml` checks the relative links and anchors of the
Markdown files when they change. It runs offline, with read-only repository
permissions, and fetches nothing from the URLs it reads.
