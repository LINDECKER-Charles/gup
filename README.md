<div align="center">

# `gup` — Global Updater

**One command to scan and update everything installed on your machine.**

[**Homepage**](https://lindecker-charles.github.io/gup/) · [**Documentation**](docs/) · [**Providers (153)**](docs/guide/providers-catalog.md) · [**npm**](https://www.npmjs.com/package/@charles_lindecker/gup)

[![npm](https://img.shields.io/npm/v/@charles_lindecker/gup?logo=npm&color=CB3837)](https://www.npmjs.com/package/@charles_lindecker/gup)
[![npm downloads](https://img.shields.io/npm/dm/@charles_lindecker/gup?logo=npm&color=CB3837&label=downloads)](https://www.npmjs.com/package/@charles_lindecker/gup)
[![CI](https://github.com/LINDECKER-Charles/gup/actions/workflows/ci.yml/badge.svg)](https://github.com/LINDECKER-Charles/gup/actions/workflows/ci.yml)
[![Node](https://img.shields.io/badge/node-%E2%89%A526.9-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux%20%7C%20WSL-4c6ef5)](docs/guide/installation.md#platform-support)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

<img src="https://raw.githubusercontent.com/LINDECKER-Charles/gup/main/docs/assets/screens/packages-select.svg" alt="The gup interactive app: 12 outdated packages grouped by provider, some checked, scheduled packages marked, a failed Scoop scan shown inline, and the update button at the bottom." width="812">

<sub>winget · scoop · choco · MSYS2 · brew · casks · Mac App Store · MacPorts · Sparkle · Nix · apt · dnf · npm · pnpm · yarn · bun · pip · pipx · uv · cargo · gem · composer · dotnet SDK &amp; tools · vcpkg · helm · kubectl · terraform · VS Code · JetBrains · Visual Studio · WSL distros — **153 providers**</sub>

</div>

---

On a dev machine, binaries come from dozens of sources and no native tool covers them all:
`winget upgrade --all` silently skips pinned packages, `brew upgrade` never sees your npm globals
or your VS Code extensions, `ncu -g` only sees npm, and every cloud CLI ships its own
`self-update`. `gup` unifies the whole thing behind one CLI and one interactive app.
[Why, and what's deliberately out of scope →](docs/guide/scope.md)

## Highlights

- **153 providers**, scanned in parallel — OS package managers, language toolchains, cloud and
  Kubernetes CLIs, editor extensions — each greyed out on the systems it does not exist on.
- **Pick exactly what to update**: check packages, press Enter — only what is checked is
  updated.
- **Updates run inside the app**, each install live in an embedded terminal — progress bars,
  prompts you can answer — with one UAC or `sudo` prompt for all the admin packages.
- **Scheduled updates, per package** — never a whole provider — run by a short-lived gup the OS
  starts; nothing stays resident.
- **An activity journal** in the terminal, and a self-contained **HTML report** in your browser.
- **Ten themes, contrast guaranteed**: every text reaches WCAG AA, your custom colours included.
- **Scriptable**: `--json`, documented exit codes, `-y` for CI, a debug log you can export.
- **English or French**: the app, every command and its help, the HTML report —
  `gup language fr` switches.

<table>
<tr>
<td width="50%"><img src="https://raw.githubusercontent.com/LINDECKER-Charles/gup/main/docs/assets/screens/update-running.svg" alt="An update running inside gup: three packages done, PowerToys downloading with winget's progress bar in the embedded terminal pane, two more queued." width="400"><br><sub><b>Updates inside the app</b> — the installer's real output, live.</sub></td>
<td width="50%"><img src="https://raw.githubusercontent.com/LINDECKER-Charles/gup/main/docs/assets/screens/schedules.svg" alt="The Schedules view: three schedules with their recurrence, next and last run, and the last run's results package by package." width="400"><br><sub><b>Scheduled updates</b> — chosen packages, on your schedule.</sub></td>
</tr>
<tr>
<td width="50%"><img src="https://raw.githubusercontent.com/LINDECKER-Charles/gup/main/docs/assets/screens/journal-activity.svg" alt="The Journal view: a year of updates as a calendar heatmap, headline figures, the outdated-package trend and the slowest scans." width="400"><br><sub><b>Activity journal</b> — a year of updates at a glance.</sub></td>
<td width="50%"><img src="https://raw.githubusercontent.com/LINDECKER-Charles/gup/main/docs/assets/screens/html-report.png" alt="The HTML report's overview in a browser: a summary sentence, key figures and the latest weeks' calendar." width="400"><br><sub><b>HTML report</b> — one offline file, opened in your browser.</sub></td>
</tr>
<tr>
<td width="50%"><img src="https://raw.githubusercontent.com/LINDECKER-Charles/gup/main/docs/assets/screens/options-themes.svg" alt="The theme picker: every theme with its lowest contrast ratio, the theme under the cursor previewed on the whole app." width="400"><br><sub><b>Themes</b> — previewed live, WCAG AA guaranteed.</sub></td>
<td width="50%"><img src="https://raw.githubusercontent.com/LINDECKER-Charles/gup/main/docs/assets/screens/providers-os.svg" alt="The Providers view on Windows: providers not installed with their install command, and the macOS and Linux ones greyed out as incompatible." width="400"><br><sub><b>OS-aware</b> — providers of other systems greyed out, never probed.</sub></td>
</tr>
</table>

<sub>Every screen, generated from the real app: [the gallery →](docs/assets/screens/README.md)</sub>

## Install

```bash
npm install -g @charles_lindecker/gup --allow-scripts=node-pty
```

The interface is in English. To have it in French, chain the language to the install:

```bash
npm install -g @charles_lindecker/gup --allow-scripts=node-pty && gup language fr
```

Windows PowerShell 5.1 has no `&&`: run the two commands one after the other. `gup language`
switches at any time. [Details →](docs/guide/installation.md#choosing-the-language)

Node ≥ 26.9 · Windows, macOS, Linux, WSL. [Other install methods →](docs/guide/installation.md)

> **Why `--allow-scripts=node-pty`?** gup's one optional native dependency,
> [node-pty](https://github.com/microsoft/node-pty), runs installers inside the app's terminal
> pane. It has install scripts, which npm 11 asks you to review: the flag approves that one
> package (without it npm warns, and refuses under `strict-allow-scripts`). Without node-pty, gup
> works the same — updates started from the app just run in your terminal.
> [Details →](docs/guide/installation.md#npm-11-and-install-scripts)

## Use

```bash
gup                # the interactive app
gup list --fast    # what's outdated, fast scan
gup update --all   # update everything
```

| Command | Effect |
|---|---|
| `gup` | Interactive app: scan, pick, update, schedule, journal, providers, options |
| `gup list` | Lists outdated packages as a table (`--fast`, `--provider`, `--json`) |
| `gup update` | Pick packages, then update them |
| `gup update --all` | Everything, after confirmation (`-y` to skip it) |
| `gup update winget:Spotify.Spotify npm-g:typescript` | Specific targets, no scan |
| `gup doctor` | Detected, missing and incompatible providers, and gup's own state |
| `gup schedule add winget:Git.Git --every weekly --on mon` | Update chosen packages automatically |
| `gup report` | The activity report, in your browser (`--format text\|json\|csv`) |
| `gup log` | The debug log; `gup log export` for a bug report |
| `gup language fr` | The interface in French; `gup language en` brings English back |

Every flag, the retry strategies, the stuck-install timeout, environment variables, exit codes and
the JSON schema: [**CLI reference →**](docs/guide/cli-reference.md)

## Scripting

<img src="https://raw.githubusercontent.com/LINDECKER-Charles/gup/main/docs/assets/demo.svg" alt="Terminal running gup list --fast: 12 providers scanned in 5.7 seconds, 6 outdated packages listed" width="692">

The commands never prompt with `-y`, write JSON with `--json` and say how it went in their
[exit code](docs/guide/cli-reference.md#exit-codes). Warnings go to stderr, so a pipe stays clean.

## Documentation

| Document | What's in it |
|---|---|
| [Installation](docs/guide/installation.md) | Install methods, choosing the language, npm 11 and install scripts, requirements, per-platform support |
| [Interactive app](docs/guide/interactive-app.md) | Every view and key: scanning, picking, updating in the app, the run view |
| [CLI reference](docs/guide/cli-reference.md) | Every command, flag, environment variable, exit code |
| [Scheduled updates](docs/guide/scheduled-updates.md) | Schedules, recurrences, the OS trigger, what an unattended run never does |
| [Journal and reports](docs/guide/journal-and-reports.md) | The activity history, the Journal view, the HTML report, the debug log |
| [Configuration](docs/guide/configuration.md) · [Themes and accessibility](docs/guide/themes-and-accessibility.md) | Settings, the interface language, the settings file, themes, the contrast guarantee |
| [Troubleshooting](docs/guide/troubleshooting.md) | Messages, causes, fixes; where gup keeps its files; collecting a diagnostic |
| [Scope](docs/guide/scope.md) · [Providers catalog](docs/guide/providers-catalog.md) | What `gup` covers, and the 153 providers |
| [Architecture](docs/development/architecture.md) · [How `gup` works](docs/development/how-gup-works.md) | Layers, pipelines, process seams, local state — with diagrams |
| [Changelog](docs/changelog/README.md) · [Release notes](docs/releases/README.md) | Every change since the first commit; what each version shipped |
| [All documentation →](docs/README.md) | The full index, contributors' pages included |

## Community

| Document | What's in it |
|---|---|
| [Contributing](.github/CONTRIBUTING.md) | Ways to contribute, adding a provider, branches and commits, the pull request flow |
| [Code of conduct](.github/CODE_OF_CONDUCT.md) | The Contributor Covenant 2.1, and where to report a breach privately |
| [Support](.github/SUPPORT.md) | Where to ask, what to include, what to expect |
| [Security](.github/SECURITY.md) | Supported versions, private vulnerability reporting, threat model |
| [Governance](.github/GOVERNANCE.md) | Who decides, roles, dependency and release policies |

## Credits

Built and maintained by [Charles Lindecker](https://github.com/LINDECKER-Charles),
under the [MIT license](LICENSE).

If `gup` saves you time: [☕ Ko-fi](https://ko-fi.com/charleslindecker) ·
[GitHub Sponsors](https://github.com/sponsors/LINDECKER-Charles) ·
or [a star](https://github.com/LINDECKER-Charles/gup/stargazers).
