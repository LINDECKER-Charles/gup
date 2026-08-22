# Scope

`gup` has one job: **update what is already installed globally on a machine**,
whatever put it there. Everything on this page follows from that sentence.

- [Why it exists](#why-it-exists)
- [In scope](#in-scope)
- [What `gup` is not](#what-gup-is-not)
- [Out of scope](#out-of-scope)
- [Missing a source?](#missing-a-source)

## Why it exists

On a dev workstation a binary can come from a dozen competing sources, each
with its own listing command, its own output format, and its own blind spots:

- `winget upgrade --all` silently skips pinned and unknown-version packages.
- `brew upgrade` never sees your npm globals or your VS Code extensions.
- `ncu -g` only sees npm.
- Cloud CLIs (`az`, `gcloud`, `aws`) each ship their own `self-update`.
- HashiCorp tools have no built-in updater at all — you diff against a release
  feed by hand.

No native tool covers the whole surface. The practical fallback is ten to
fifteen commands chained manually, several times a month, with no way to know
which one forgot what. `gup` collapses that into one parallel scan and one
update pipeline, behind a single CLI and an interactive menu.

How that is built — the provider contract, the scan engine, the fail-soft rules
— is in [`how-gup-works.md`](../development/how-gup-works.md).

## In scope

A source belongs in `gup` when it satisfies two conditions:

1. It installs things **globally on the machine**, not into a project.
2. It exposes a **programmatic way to answer "is there a newer version"** — a
   listing command, a registry API, or a releases feed.

That covers system package managers, language-level global installs, toolchain
and version managers, cloud/IaC/Kubernetes CLIs, editor extensions, shell
tooling, and the package managers themselves. The full list, with per-provider
status, is in [`providers-catalog.md`](providers-catalog.md).

## What `gup` is not

- **Not a package manager.** It publishes nothing, resolves no dependency, and
  holds no shared state. It drives the managers you already have.
- **Not an agent.** No daemon, no tray icon, no background polling. Every scan
  is something you asked for.
- **Not project-scoped.** `package.json`, `requirements.txt`, `Cargo.toml`,
  `composer.json` — none of that is its business.
- **Not an OS updater.** Kernel, drivers and system releases belong to the OS.

## Out of scope

Each exclusion below is a decision, not a gap.

| Excluded | Why | Use instead |
|---|---|---|
| Windows Update, OEM drivers, DISM, provisioned Appx | An OS release is not a package upgrade: different failure modes, different reboot semantics, different blast radius. Mixing them into an "update all" would make that command unsafe to run casually — which is the one thing it must stay. | [`PSWindowsUpdate`](https://www.powershellgallery.com/packages/PSWindowsUpdate) |
| macOS system updates (`softwareupdate`, XProtect/MRT, Command Line Tools) | Same rule as Windows Update, applied consistently. | `softwareupdate` |
| Apple's system Ruby (`/usr/bin/gem`) | Frozen by Apple under SIP, so `gem update` there cannot succeed. Rather than report ~40 permanently-unfixable gems, the `gem` provider hides itself when it resolves to that path. | A `brew` / `rbenv` / `asdf` Ruby |
| Project manifests and lockfiles (Maven, Gradle, sbt, bundler, `npm ci`, `pip-tools sync`) | They describe a repository, not a machine. Bumping them is a reviewed commit with a test run behind it, not a maintenance chore. | Dependabot / Renovate |
| JetBrains Toolbox-managed IDEs | The Toolbox owns those installs and ships its own updater; a second updater touching them would race it. Standalone JetBrains installs *are* covered. | The Toolbox itself |

## Missing a source?

If a source meets the two conditions above and no provider covers it yet, it is
one file away — see [`CONTRIBUTING.md`](../../CONTRIBUTING.md) for the workflow.

Check [`providers-catalog.md`](providers-catalog.md) first: alongside the
implemented providers it tracks candidates that were evaluated, and the ones
deliberately turned down.
