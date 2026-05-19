# Security

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

## Reporting a vulnerability

Open a private security advisory on the GitHub repository. Avoid filing a
public issue with reproducer details.
