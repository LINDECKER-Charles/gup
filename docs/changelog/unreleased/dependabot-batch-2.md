# dependabot-batch-2

## Dependencies

- **deps-dev:** eslint 10.11.0 → 10.12.0 (eslint group): false-positive and autofix fixes, no
  breaking change; dev-only, read by `npm run lint` and `lint:security`
  (`build(deps-dev): bump eslint from 10.11.0 to 10.12.0 in the eslint group`,
  [#105](https://github.com/LINDECKER-Charles/gup/pull/105))
- **deps-dev:** @typescript-eslint/eslint-plugin 8.71.0 → 8.71.1 (dev-dependencies group): rule
  fixes (`no-unused-vars`, `prefer-optional-chain`, `no-misused-promises`…) that mostly remove
  false positives from the linters
  (`build(deps-dev): bump the dev-dependencies group with 3 updates`,
  [#106](https://github.com/LINDECKER-Charles/gup/pull/106))
- **deps-dev:** @typescript-eslint/parser 8.71.0 → 8.71.1 (dev-dependencies group): version
  alignment with the plugin, no code change
  (`build(deps-dev): bump the dev-dependencies group with 3 updates`,
  [#106](https://github.com/LINDECKER-Charles/gup/pull/106))
- **deps-dev:** happy-dom 20.14.5 → 20.14.6 (dev-dependencies group): fixes cookie-scope
  spoofing; used by the DOM tests only, never shipped
  (`build(deps-dev): bump the dev-dependencies group with 3 updates`,
  [#106](https://github.com/LINDECKER-Charles/gup/pull/106))
