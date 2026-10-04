# tidy-repo-root

## CI

- **docs:** lychee checks the Markdown files of `.github/` too: its globs skip hidden directories,
  so `./**/*.md` never reached the pull request template, and would have dropped the community
  files moving there (`ci(docs): check the Markdown links under .github`)

## Documentation

- **community:** `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SUPPORT.md`, `SECURITY.md` and
  `GOVERNANCE.md` move from the root to `.github/`, where GitHub still finds them: the
  *Community* tab, the tabs beside the README, the security policy, the guidelines linked from a
  new issue or pull request. The README, the docs, the issue chooser, the landing's footer and
  `llms.txt` / `llms-full.txt` link to the new paths, and the scope map names them
  (`docs(community): move the community health files under .github`)

## Internal

- The npm package no longer ships `SECURITY.md`: npm shows the README alone, whose links lead to
  the security policy on GitHub, and a copy frozen into each published version would go on
  stating the supported versions and response aims of the day it was packed
  (`build: stop shipping SECURITY.md in the npm package`)
