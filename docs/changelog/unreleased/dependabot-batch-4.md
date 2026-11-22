# dependabot-batch-4

## Security

- **deps:** vite 8.2.2 → 8.3.8 in the root lockfile, pulled by vitest and `@vitest/mocker`, for
  GHSA-698v-4r3x-3vcv, GHSA-r825-w8mm-5pxw, GHSA-587h-7wmj-h5pm (launch-editor),
  GHSA-9jrq-w75r-8gcw, GHSA-rq7h-c2jc-7f22 and GHSA-vfpm-58rq-9qcg; brings rolldown 1.2.19 and
  postcss 8.5.33
  (`build(deps): bump transitive vite from 8.2.2 to 8.3.8`,
  [#128](https://github.com/LINDECKER-Charles/gup/pull/128), supersedes
  [#122](https://github.com/LINDECKER-Charles/gup/pull/122))
- **deps:** vitest and `@vitest/coverage-v8` 4.1.11 → 4.1.12 for GHSA-qxg6-89mg-rqv8 and
  GHSA-xp26-3454-mjgp; stays on the 4.x line
  (`build(deps): bump vitest and @vitest/coverage-v8 to 4.1.12`)
- **deps:** happy-dom 20.14.6 → 21.0.4 for GHSA-834v-8h66-3h79 (host code execution through an
  import alias) and GHSA-c8p4-j97h-3vg8 (SSRF via iframe and stylesheet links); 21.0.0 turns CSS
  and iframe loading off by default, which neither DOM suite relies on, so no test changes
  (`build(deps): bump happy-dom from 20.14.6 to 21.0.4`,
  [#123](https://github.com/LINDECKER-Charles/gup/pull/123))
- **deps:** eslint 10.12.0 → 10.15.0, `@typescript-eslint/eslint-plugin` and `parser`
  8.71.1 → 8.73.0, eslint-plugin-security 4.2.0 → 4.2.1: the first eslint and typescript-eslint
  releases on minimatch 11, for GHSA-g3hv-75wg-m249 (minimatch 7.0.0 – 11.0.0, DoS via globparts
  amplification); goes past Dependabot's 10.14.0 / 8.72.1, which still carried it; minimatch held
  at 11.0.8 in the lockfile
  (`build(deps): bump eslint, typescript-eslint and eslint-plugin-security`,
  [#124](https://github.com/LINDECKER-Charles/gup/pull/124))
- **landing:** vite 8.2.1 → 8.3.8 in the landing page, for the same six vite and launch-editor
  advisories as the root; past the 8.3.4 Dependabot proposed, so both lockfiles match
  (`build(landing): bump vite from 8.2.1 to 8.3.8`,
  [#121](https://github.com/LINDECKER-Charles/gup/pull/121))
- **landing:** puppeteer-core 25.12.0 → 25.17.0 (chromium-bidi 157.0.8090-0, zod 3.25.76 → 4.6.7,
  GHSA-mrhx-c7xc-m3w5) and fast-uri 3.1.8 → 3.1.9 (GHSA-w74x-v6f9-j3xg, GHSA-xhq7-xmqj-769h,
  GHSA-wjr9-j795-jxcr, GHSA-333x-w4r6-6crp), lighthouse transitives, lockfile-only; `npm audit`
  in `index/` was red on them although no Dependabot PR covered it
  (`build(landing): bump lighthouse's puppeteer-core and ajv transitives`)

## Dependencies

- **deps:** semver 7.8.5 → 7.8.6 (runtime-dependencies group): faster range parsing, no API change
  (`build(deps): bump semver from 7.8.5 to 7.8.6`,
  [#125](https://github.com/LINDECKER-Charles/gup/pull/125))
- **deps:** execa 10.1.0 → 10.2.1: exceeding `maxBuffer` now kills the child instead of leaving
  the promise pending, invalid file descriptors throw instead of crashing gup; 10.2.0 types the
  subprocess from its options, so `launchDetached` in `src/core/runner.ts` drops its
  `as ResultPromise` cast (TS2352), with no behaviour change
  (`build(deps): bump execa from 10.1.0 to 10.2.1`, replaces the closed
  [#127](https://github.com/LINDECKER-Charles/gup/pull/127))
