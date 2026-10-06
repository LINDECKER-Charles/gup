# source-map-js-advisory

## Security

- **deps:** source-map-js 1.2.1 → 1.2.2 for
  [GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q) (high: event-loop
  denial of service through indexed source-map section offsets). Dev-only, pulled by
  `tsup` → `postcss` and `@vitest/coverage-v8` → `magicast`; the `npm audit (audit-ci)` gate failed
  on every branch (`build(deps): bump source-map-js to 1.2.2 for GHSA-68fv-2mgg-jv7q`)
