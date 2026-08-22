# Unreleased — `main` as of 2026-08-22

[Compare `0.3.2...main`](https://github.com/LINDECKER-Charles/gup/compare/0.3.2...main)

**16 commits** · Charles Lindecker, dependabot[bot]

This range raises the supported runtime floor to Node >= 24.11.0 (a breaking change for Node 22 users), clears the nanoid GHSA-2v37-7h3g-55p8 advisory that was failing the security workflow in both lockfiles, and moves Dependabot to a weekly cadence while keeping its cooldown windows. It also lands a handful of dev-dependency and landing-site bumps and a new docs/roadmap.md capturing the deferred Node 26 and TypeScript 7 migrations.

## Changed

- Require Node >= 24.11.0 (was 22.13.0): engines, tsup target `node24`, `@types/node` on the 24 line, CI matrix reduced to Node 24, and every documented minimum updated; npm now reports EBADENGINE on Node 22 ([`4ff78a2`](https://github.com/LINDECKER-Charles/gup/commit/4ff78a2), [#66](https://github.com/LINDECKER-Charles/gup/pull/66))

## Security

- **deps:** Bump transitive nanoid to 3.3.18 in both the root and `/index` lockfiles for GHSA-2v37-7h3g-55p8 (infinite loop on size 0), bringing `npm audit` back to 0 vulnerabilities and unblocking the security workflow ([`72eb6b8`](https://github.com/LINDECKER-Charles/gup/commit/72eb6b8), [`279d410`](https://github.com/LINDECKER-Charles/gup/commit/279d410), [#65](https://github.com/LINDECKER-Charles/gup/pull/65))

## Dependencies

- **deps-dev:** Bump tsx from 4.23.9 to 4.23.11 ([`1013003`](https://github.com/LINDECKER-Charles/gup/commit/1013003), [#62](https://github.com/LINDECKER-Charles/gup/pull/62))
- **deps-dev:** Bump @typescript-eslint/eslint-plugin and @typescript-eslint/parser from 8.66.0 to 8.67.0, and tsx from 4.23.11 to 4.23.12 ([`b07c38c`](https://github.com/LINDECKER-Charles/gup/commit/b07c38c), [#69](https://github.com/LINDECKER-Charles/gup/pull/69))
- **deps-dev:** Bump eslint from 10.8.0 to 10.8.1 ([`66d5ee9`](https://github.com/LINDECKER-Charles/gup/commit/66d5ee9), [#68](https://github.com/LINDECKER-Charles/gup/pull/68))
- **landing:** Bump vite from 8.0.16 to 8.2.1 and the Geist / Geist Mono fontsource packages to 5.3.0 in `/index`; the bundled Geist Mono woff2 is refreshed (ligatures dropped upstream) ([`93ebfe3`](https://github.com/LINDECKER-Charles/gup/commit/93ebfe3), [#71](https://github.com/LINDECKER-Charles/gup/pull/71))

## CI

- **dependabot:** Run version updates weekly (Monday 05:00 Europe/Paris) for npm, `/index` and GitHub Actions instead of monthly; cooldown floors (7/14/30 days) and PR limits are unchanged ([`8dbb02f`](https://github.com/LINDECKER-Charles/gup/commit/8dbb02f), [#71](https://github.com/LINDECKER-Charles/gup/pull/71))

## Documentation

- **roadmap:** Add `docs/roadmap.md` recording the decided-but-deferred changes — Node 26 in the CI matrix from 2026-10-28 and the TypeScript 7 port once typescript-eslint supports it — linked from the README and docs index ([`089db71`](https://github.com/LINDECKER-Charles/gup/commit/089db71), [#67](https://github.com/LINDECKER-Charles/gup/pull/67))
