# gup v0.1.1

Patch release focused on **security hardening**, **provider reliability**, and **project infrastructure** (landing site, packaging metadata). No breaking changes — drop-in upgrade from `0.1.0`.

## Highlights

- 🔒 **Security hardening** across runner and providers — argument validation, sanitizer barriers, CodeQL alert remediation.
- 🐛 **Provider fixes** — pip availability check now awaited, semgrep upgrade resolves the host Python before bumping, wsl-dnf refresh marker surfaced, docker-desktop path passed via env var.
- 🌐 **Landing site** at https://lindecker-charles.github.io/gup/ — Vite/React, self-hosted Geist fonts, tightened SEO metadata.
- 📦 **npm metadata** enriched: `homepage`, `keywords`, `funding` (Ko-fi + GitHub Sponsors), `files`, `os`.
- 📚 **Docs** translated to English (README, CONTRIBUTING), badges and URLs refreshed.

## Security

- `fix(security)`: harden command and argument validation across runner and providers (`dd4e216`)
- `fix(security)`: replace runner asserts with sanitizer barriers and silence vetted lint warnings (`e7c3ea5`)
- `fix(security)`: pass docker-desktop exe path via env var to satisfy CodeQL alert #12 (`882b83b`, PR #17)

## Fixes

- `fix(providers/security)`: resolve host python before upgrading semgrep to avoid `--user` shadow install (`9aa9131`)
- `fix(providers)`: await pip availability check and surface wsl-dnf refresh marker (`bb44399`)
- `fix(landing)`: resolve logo URLs via vite `BASE_URL` (`42909de`)

## Tooling & infrastructure

- `feat(landing)`: add Vite/React landing site under `index/` with SEO assets (`4423d09`)
- `ci(pages)`: GitHub Pages workflow building and deploying the landing site (`772da89`)
- `ci(pages)`: bump `setup-node` to v5 on node 22, force pages actions to node 24 (`27ac165`)
- `perf(landing)`: self-host Geist fonts to drop google-fonts render block (`f0137d5`)
- `chore(landing)`: pin vite to 6.4 to match `@vitejs/plugin-react` compatibility (`270ce95`)
- `chore(deps)`: bump esbuild and vite in `/index` (PR #16)

## Packaging & docs

- `chore(npm)`: enrich package metadata — homepage, keywords, funding, files (`5772c9b`)
- `chore(npm)`: drop self-dependency and sync funding/os metadata in lockfile (`770e106`)
- `chore(funding)`: add GitHub Sponsors username (`b030932`), Ko-fi username (`398bdfe`)
- `docs`: translate README and CONTRIBUTING to English, refresh repo URLs and badges (`7879f2b`)
- `docs(readme)`: add npm install path and registry badge (`fb6a564`)
- `chore`: flesh out provider template skeleton and tighten test assertions (`a2876a9`)

## Install

```bash
npm install -g @charles_lindecker/gup
```

```bash
gup --help
```

## Links

- 🌐 Landing: https://lindecker-charles.github.io/gup/
- 📦 npm: https://www.npmjs.com/package/@charles_lindecker/gup
- 🐛 Issues: https://github.com/LINDECKER-Charles/gup/issues
- ❤️ Sponsor: https://ko-fi.com/charleslindecker · https://github.com/sponsors/LINDECKER-Charles

**Full changelog**: https://github.com/LINDECKER-Charles/gup/compare/0.1.0...0.1.1
