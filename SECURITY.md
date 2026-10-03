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
  shipped;
- how it starts processes: command or argument injection, a package id or
  version from an upstream tool reaching a shell, an update routed to the
  wrong package manager;
- its network access (upstream version probes);
- every file `gup` itself writes under your profile, such as the activity
  history.

Out of scope:

- vulnerabilities in the package managers `gup` drives, or in the packages
  they install: report those upstream;
- the terminal emulator `gup` runs in;
- attacks that need write access to your user profile or to a directory on
  your `PATH`: an attacker with that access already runs code as you;
- social engineering.

## Threat model

`gup` is a CLI that scans installed package managers and shells out to them to
perform upgrades. The dominant risks are:

1. **Command injection** — a hostile upstream manifest or registry response
   could carry shell metacharacters in a package id. Mitigation: all subprocess
   calls go through `src/core/runner.ts` (`execa`, argv vector, no `shell`).
   The two exceptions that need `shell: true` (Scoop's PowerShell shim) are
   pinned by allowlist in `tests/security/shell-usage.test.ts`.
2. **MITM on upstream version probes** — every `fetch()` target must be https.
   Enforced by `tests/security/http-targets.test.ts`.
3. **Provider mis-routing** — `inferSourceFromPath` decides which PM owns a
   binary; misclassification could drive the wrong upgrade. Pinned by
   `tests/security/install-source.test.ts`.

Out of that scope, the orchestrator writes one thing of its own to disk: the
activity history (`src/core/history/`). It is a plain-text JSONL log of scans
and update attempts — package ids, versions, outcomes — under the user's own
state directory, with no credential, no path outside it, and no network egress.
It is never read back, so a tampered log cannot influence an upgrade. Disable it
with `GUP_HISTORY=0`. (Individual providers may still write as part of the
install they perform — the Nerd Fonts provider keeps a version lockfile — which
is install work, not tool state.)

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
- **semgrep**: custom rules in `.semgrep.yml` plus `p/typescript` and
  `p/nodejs` community packs
- **gitleaks**: secret scanning with config `.gitleaks.toml`

Dependabot (`.github/dependabot.yml`) opens grouped weekly PRs for npm + GH
Actions updates.
