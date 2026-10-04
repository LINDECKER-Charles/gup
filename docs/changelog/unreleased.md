# Unreleased — `main` after 0.5.0

[Compare `0.5.0...main`](https://github.com/LINDECKER-Charles/gup/compare/0.5.0...main)

**2 commits** · Charles Lindecker

Documentation fixed on the release branch after the version bump, outside the npm package: the install guides and the 0.5.0 release notes cover npm 12, which skips the install scripts of a plain global install where npm 11 runs them, and the release notes' summary no longer reads as one administrator prompt per package.

## Documentation

- **guide, releases:** npm 12 skips node-pty's install scripts on a plain `npm i -g @charles_lindecker/gup`, where npm 11 runs them with a warning: the installation and troubleshooting guides and the 0.5.0 release notes quote npm 12's warning and say what it means — nothing on Windows and macOS, whose prebuilt binary works without the scripts, and no embedded terminal on Linux, as with `--ignore-scripts` ([`e9ef7d7`](https://github.com/LINDECKER-Charles/gup/commit/e9ef7d7), [#89](https://github.com/LINDECKER-Charles/gup/pull/89))
- **releases:** The 0.5.0 TL;DR says a single UAC or `sudo` prompt covers all the administrator packages; "one prompt for every administrator package" read as one per package (`docs(releases): say one admin prompt covers the whole 0.5.0 batch`, [#89](https://github.com/LINDECKER-Charles/gup/pull/89))
