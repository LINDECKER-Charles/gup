# Documentation

Index of the detailed `gup` documentation. The root [`README.md`](../README.md)
stays light; everything dense lives here.

## Layout

| Folder | Content |
|---|---|
| [`guide/`](guide/) | User-facing: install, run, what is in and out of scope, the provider catalog. |
| [`development/`](development/) | Contributor-facing: architecture, end-to-end internals, roadmap, release procedure. |
| [`releases/`](releases/) | Per-version release notes — the source text of each GitHub Release. |
| [`changelog/`](changelog/) | Commit-level history of every version, from the first commit to `main`; `changelog/unreleased/` holds one fragment per branch merged since the last release. |
| [`assets/`](assets/) | Images embedded by the docs (the terminal demo). |
| `archived/` | Local working documents — audit reports, snapshots. **Gitignored**, only its [`README.md`](archived/README.md) is tracked. |

## For users

| Document | Content |
|---|---|
| [`guide/installation.md`](guide/installation.md) | Install methods (npm, from source), requirements, per-platform support, updating and removing `gup`. |
| [`guide/cli-reference.md`](guide/cli-reference.md) | Every command and flag, the interactive menu, targeting syntax, stuck-install timeouts, retry strategies, JSON output, environment variables, exit codes, activity history. |
| [`guide/scope.md`](guide/scope.md) | Why `gup` exists, what belongs in it, and what is deliberately excluded — with the reasoning. |
| [`guide/providers-catalog.md`](guide/providers-catalog.md) | Exhaustive catalog of the 153 providers, implementation status (✅ ⬜ ➡️ ❌), and evaluated candidates. |

## For contributors

| Document | Content |
|---|---|
| [`development/architecture.md`](development/architecture.md) | Layers & responsibilities, data model, provider lifecycle, parallel scan, update pipeline + retry, security — **mermaid diagrams**. |
| [`development/how-gup-works.md`](development/how-gup-works.md) | End-to-end technical walkthrough: motivation, model, internal contracts, resilience patterns, build. |
| [`development/roadmap.md`](development/roadmap.md) | Changes already decided but waiting on an external trigger — a date or an upstream release. Each entry carries its trigger, the exact edits, and what must not change. |
| [`development/releasing.md`](development/releasing.md) | How a version goes from `main` to npm, the GitHub Release and the landing page: pre-flight, changelog and notes, checks, tag, publish, hotfixes — **mermaid diagram**. |

## Community

The files GitHub surfaces in the repository's *Community* tab, at the root of
the repository and in `.github/`.

| Document | Content |
|---|---|
| [`../CONTRIBUTING.md`](../CONTRIBUTING.md) | Ways to contribute, local setup, provider-addition workflow, conventions and enforced code limits, branches, commits and the scope map, the pull request flow and its required checks — **mermaid diagrams**. |
| [`../CODE_OF_CONDUCT.md`](../CODE_OF_CONDUCT.md) | The Contributor Covenant 2.1: expected behaviour, the private contact for reports, the enforcement guidelines. |
| [`../SUPPORT.md`](../SUPPORT.md) | Where to ask for help, what to include, what to expect from a single-maintainer project. |
| [`../SECURITY.md`](../SECURITY.md) | Supported versions, private vulnerability reporting and response aims, scope, threat model, CI/local mitigations. |
| [`../GOVERNANCE.md`](../GOVERNANCE.md) | Maintainer-led model, roles, how decisions are made, dependency and release policies, continuity. |
| [`../CHANGELOG.md`](../CHANGELOG.md) | Pointer to the changelog and the release notes below. |
| [`../CITATION.cff`](../CITATION.cff) | Citation metadata behind GitHub's *Cite this repository* button. |
| [`../.github/ISSUE_TEMPLATE/`](../.github/ISSUE_TEMPLATE/) | Issue forms (bug report, feature request, new provider, question) and the chooser links. |
| [`../.github/PULL_REQUEST_TEMPLATE.md`](../.github/PULL_REQUEST_TEMPLATE.md) | The checklist every pull request starts from. |

## Project history

| Document | Content |
|---|---|
| [`changelog/`](changelog/README.md) | Every change since the first commit, one file per version plus the unreleased work on `main`, grouped by kind (Added / Changed / Fixed / Security / Dependencies / …) with commit and PR links. |
| [`releases/`](releases/README.md) | Per-version release notes — what shipped, what broke, how it was verified. Narrative, written before tagging; the GitHub Release body is this text plus GitHub's auto-generated "What's Changed". |

The two are complementary: the changelog is exhaustive and mechanical, the
release notes explain *why* a version matters. To find out whether a given
commit shipped, use the changelog; to decide whether to upgrade, read the notes.

## Mermaid diagrams

Mermaid diagrams render natively on GitHub. Locally:

- VS Code → *Markdown Preview Mermaid Support* extension.
- PNG/SVG export → [mermaid.live](https://mermaid.live) (copy-paste the block).

The rules for writing one (stable diagram types, size, no diagram in the root
`README.md`) are in [`CONTRIBUTING.md` § Documentation](../CONTRIBUTING.md#10-documentation).

## Suggested reading order

Which document to open first, depending on what you came for:

```mermaid
flowchart LR
    A[README] --> B{Goal?}
    B -->|Install it| I[guide/installation.md]
    B -->|Use or script it| C[guide/cli-reference.md]
    B -->|Know its limits| SC[guide/scope.md]
    B -->|Find a provider| E[guide/providers-catalog.md]
    B -->|Get help| SUP[SUPPORT.md]
    B -->|Contribute| D[development/architecture.md] --> F[CONTRIBUTING.md]
    B -->|Deep dive| G[development/how-gup-works.md]
    B -->|Know what's coming| R[development/roadmap.md]
    B -->|Know what changed| L[changelog/] --> N[releases/]
    B -->|Ship a release| REL[development/releasing.md]
    B -->|Report a vuln| H[SECURITY.md]
```
