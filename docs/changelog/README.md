# Changelog

Commit-level history of `gup`, one file per version, newest first. Every commit
since the first one is accounted for: each bullet links the commit(s) it covers
and the pull request when there was one. Generated from `git log` on
2026-08-22, extended at each release since, and verified against it; for the
narrative of each release, see
[`../releases/`](../releases/README.md).

| Version | Published | Commits | In one sentence |
|---|---|---:|---|
| [Unreleased](unreleased.md) | `main` after 0.5.3 | 0 | Nothing yet. |
| [`0.5.3`](0.5.3.md) | not yet published | 16 | 0.5.3 adds 17 popular terminal themes, taking the picker from 10 to 27, and scrolls the picker's list to keep the cursor in view, stops a winget package that asks for an install folder from holding the batch, and bumps source-map-js for GHSA-68fv-2mgg-jv7q. |
| [`0.5.2`](0.5.2.md) | 2026-10-05 | 25 | 0.5.2 stops gup on a Node older than 26.9 with where to get a newer one and lets npm install it there, refuses to run under `sudo` and names the gup folders a `sudo` run left to root with the command that gives them back, and lists a tool Homebrew installed once, by `brew`. |
| [`0.5.1`](0.5.1.md) | 2026-10-04 | 85 | 0.5.1 makes gup speak English by default and French on demand (`gup language fr`), leaves gup's own update on Windows for after it exits, fixes pip, composer, pnpm and winget updates that reported a success they were not, and tidies the repository root. |
| [`0.5.0`](0.5.0.md) | 2026-10-04 | 541 | 0.5.0 runs updates inside the interactive app in an embedded terminal, picks packages by checking them, reads the history back as a debug log, an activity journal and an HTML report, updates chosen packages on a schedule, holds every text of ten themes to WCAG AA, greys out the providers of other systems, translates the landing site into eight languages and runs the provider tests as contracts on a fake machine; as the first version published since 0.3.2, it also ships 0.4.0. |
| [`0.4.0`](0.4.0.md) | never published | 38 | 0.4.0 fixes the terminal freezes seen on Windows, rebuilds the interactive UI on OpenTUI in place of `@inquirer/prompts` and `ora`, and moves the runtime floor to Node >= 26.9.0. |
| [`0.3.2`](0.3.2.md) | 2026-08-09 | 15 | Version 0.3.2 adds 19 providers (MSYS2, Cygwin, Npackd, Fink, pkgin, Nix, pkgx, nvm, pyenv, swiftly, mint, vcpkg, Visual Studio, Git for Windows, .NET SDK, NuGet, PSResourceGet, Sparkle, xcodes), taking the registry from 134 to 153 entries. |
| [`0.3.1`](0.3.1.md) | 2026-08-08 | 11 | gup 0.3.1 introduces a local activity history: every scan and every update attempt is appended synchronously to a monthly JSONL shard under the platform state directory, opt-out via GUP_HISTORY=0 and relocatable via GUP_HISTORY_DIR, and never read back by the tool. |
| [`0.3.0`](0.3.0.md) | 2026-08-08 | 32 | 0.3.0 makes gup genuinely cross-platform: four new macOS providers (Homebrew formulae and casks, Mac App Store, MacPorts), brew/apt/dnf install-source detection so package-manager-owned binaries are no longer hidden from the scan, and JetBrains/Eclipse discovery on macOS. |
| [`0.2.2`](0.2.2.md) | 2026-07-03 | 2 | Version 0.2.2 is a scope correction: the `docker-images` provider is dropped from gup, on the grounds that locally pulled Docker images are workload artifacts rather than tools a user wants kept up to date. |
| [`0.2.1`](0.2.1.md) | 2026-06-22 | 17 | gup 0.2.1 is a maintenance release with no functional change: every commit since 0.2.0 is a Dependabot bump. |
| [`0.2.0`](0.2.0.md) | 2026-05-28 | 42 | gup 0.2.0 makes long `update --all` runs survivable on Windows: admin-only Chocolatey packages are batched behind a single UAC prompt, wedged installers can be skipped with Ctrl+C or a per-install timeout, and polyglot packages (node, python, go…) owned by a toolchain manager such as nvm or pyenv are no longer offered for a conflicting upgrade. |
| [`0.1.1`](0.1.1.md) | 2026-05-20 | 27 | gup 0.1.1 is a patch release centred on security hardening of the command runner and several providers (command-name allowlist, argv sanitizer barriers, CodeQL alert #12 remediation for the Docker Desktop probe), plus provider reliability fixes for semgrep, pip and wsl-dnf. |
| [`0.1.0`](0.1.0.md) | 2026-05-19 | 46 | 0.1.0 is the first public release of gup: a TypeScript CLI that scans and updates every package manager on a developer machine behind a single command. |

"Published" is the npm publication date (UTC). `0.2.2` was published to npm
without a tag or a GitHub Release; its range ends at the version-bump commit.
`0.4.0` was never published nor tagged: its changes first shipped in `0.5.0`,
and its range ends at `f1864a9`, the last commit it describes.

## How to read an entry

Each file opens with the links that matter (release notes, GitHub Release, npm,
`compare` view), the commit count and the contributors, then a short summary,
then the changes grouped under a fixed set of headings, in this order:

| Heading | What goes there |
|---|---|
| **Added** | New providers, commands, flags, capabilities. |
| **Changed** | Behaviour changes, including engine floors (`node >= X`) and refactors that alter what the user sees. |
| **Fixed** | Bug fixes. |
| **Removed** | Providers or features taken out. |
| **Security** | Hardening, CodeQL remediation, bumps made for an advisory. |
| **Dependencies** | Dependency bumps with no other purpose (Dependabot or manual). |
| **CI** | Workflows, Dependabot configuration, Pages deployment. |
| **Documentation** | README, `docs/`, CONTRIBUTING, release notes, landing copy. |
| **Internal** | Refactors without behaviour change, tests, lint and build tooling, metadata, the release bump itself. |

Bullet shape: `**scope:** what changed and why it matters (commit, #PR)`. The
scope is the conventional-commit scope (`providers/cloud`, `core/runner`,
`cli`, `landing`, `deps`…). Tightly related commits — a feature and its review
follow-ups, a bump and its lockfile twin — are folded into one bullet that
lists every hash.

What is *not* a bullet:

- `Merge pull request #N` commits — the PR number is attached to the bullets
  of the commits it merged instead.
- `Merge branch 'main'` sync commits with no content of their own — listed at
  the bottom of the file so the count still adds up.

## Keeping it current

- Work merged to `main` ends up in [`unreleased.md`](unreleased.md) under the
  same headings.
- A pull request does not edit `unreleased.md`: it adds its own fragment,
  `unreleased/<branch-slug>.md` — `feat/scheduled-updates` writes
  `unreleased/scheduled-updates.md` — with the headings above and the usual
  bullet shape, the commits of that branch only (by subject until they have a
  hash on `main`). Parallel branches therefore never conflict there. Before a
  release, the fragments are folded into `unreleased.md` (one bullet per
  change, related bullets of several branches merged, every hash and subject
  kept) and the folder is deleted, as the 0.5.0 cycle's were.
- At release time, rename `unreleased.md` to `<version>.md`, set the title and
  the header links, start a fresh `unreleased.md`, and add the row above. Write
  the matching [`../releases/<version>.md`](../releases/README.md) alongside.
- Commit subjects are the raw material: a precise
  `type(scope): description` makes the entry almost mechanical, a vague one
  forces whoever writes it to read the diff.
