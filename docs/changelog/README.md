# Changelog

Commit-level history of `gup`, one file per version, newest first. Every commit
since the first one is accounted for: each bullet links the commit(s) it covers
and the pull request when there was one. Generated from `git log` on
2026-08-22 and verified against it; for the narrative of each release, see
[`../releases/`](../releases/README.md).

| Version | Published | Commits | In one sentence |
|---|---|---:|---|
| [Unreleased](unreleased.md) | `main` @ 2026-08-22 | 16 | This range raises the supported runtime floor to Node >= 24.11.0 (a breaking change for Node 22 users), clears the nanoid GHSA-2v37-7h3g-55p8 advisory that was failing the security workflow in both lockfiles, and moves Dependabot to a weekly cadence while keeping its cooldown windows. |
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

- Work merged to `main` goes into [`unreleased.md`](unreleased.md) under the
  same headings.
- At release time, rename `unreleased.md` to `<version>.md`, set the title and
  the header links, start a fresh `unreleased.md`, and add the row above. Write
  the matching [`../releases/<version>.md`](../releases/README.md) alongside.
- Commit subjects are the raw material: a precise
  `type(scope): description` makes the entry almost mechanical, a vague one
  forces whoever writes it to read the diff.
