# landing-source-map-js

## Security

- **landing:** source-map-js 1.2.1 → 1.2.2 in the landing page's lockfile for
  [GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q) (high: event-loop
  denial of service through indexed source-map section offsets), which 0.5.3 fixed in the root
  lockfile only. Dev-only, pulled by `postcss`; `npm audit (audit-ci)` reads the root lockfile
  alone, so the checks stayed green while Dependabot alert #21 stayed open
  (`build(landing): bump source-map-js to 1.2.2 for GHSA-68fv-2mgg-jv7q`)
