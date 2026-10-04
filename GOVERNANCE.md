# Governance

How `gup` is run, who decides what, and how that can change.

## Model

`gup` is **maintainer-led**. [@LINDECKER-Charles](https://github.com/LINDECKER-Charles)
created the project, holds the merge, release and npm publish rights, and makes
the final call when a discussion does not converge. Decisions are made in the
open, on issues and pull requests, with the reasoning written down.

## Roles

| Role | Who | Can |
|---|---|---|
| User | Anyone running `gup` | Open issues, answer questions, vote with 👍 on proposals |
| Contributor | Anyone with a merged pull request | Everything a user can, plus review other pull requests |
| Triager | A contributor invited after sustained, constructive participation | Label, reproduce, close duplicates and out-of-scope issues |
| Maintainer | @LINDECKER-Charles | Merge, release, publish to npm, change repository settings and this document |

Roles are granted by the maintainers and can be withdrawn after inactivity
or by request. Nobody needs a role to send a pull request.

## How decisions are made

- **Proposals go through issues.** A feature request or a new provider starts
  as an issue so that the scope question is settled before code is written.
- **Scope** follows [docs/guide/scope.md](docs/guide/scope.md). A request
  outside it is closed with a link to the reasoning; changing the scope itself
  is a pull request to that page, discussed like any other change.
- **Architecture decisions** are recorded in
  [docs/development/architecture.md § Notable decisions](docs/development/architecture.md#notable-decisions),
  so the *why* outlives the pull request that introduced it.
- **Breaking changes** are announced in the release notes
  ([docs/releases/](docs/releases/README.md)). While `gup` is in `0.x`, a minor
  version may break compatibility; the notes always say what breaks and how to
  upgrade.

## Policies

- **Dependencies.** A new runtime dependency needs an issue and a
  justification first: the install footprint is kept small on purpose, and
  every dependency is code that runs on the user's machine with their
  privileges. Native code is pinned to an exact version (today
  `@opentui/core`, whose renderer loads through `node:ffi`, and the optional
  `node-pty`); every deliberate version pin and its reason is listed in
  [CONTRIBUTING.md § Deliberate version pins](CONTRIBUTING.md#deliberate-version-pins).
- **Releases** follow [docs/development/releasing.md](docs/development/releasing.md).
  Only a maintainer tags and publishes.
- **Security reports** are handled privately, as described in
  [SECURITY.md](SECURITY.md).
- **Conduct.** Everyone taking part follows the
  [Code of Conduct](CODE_OF_CONDUCT.md). The maintainers enforce it: reports
  go privately to the contact in
  [its Enforcement section](CODE_OF_CONDUCT.md#enforcement), and consequences
  follow its enforcement guidelines.
- **Conventions** (branches, commits, code limits, tests, language) are
  documented in [CONTRIBUTING.md](CONTRIBUTING.md) and enforced by the required
  checks, not by reviewer preference.

## Continuity

`gup` is MIT-licensed: anyone can fork it and keep it alive under another
name. Transferring the npm package `@charles_lindecker/gup` or the repository
to another maintainer is at the current maintainer's discretion, and would be
announced in the repository and the release notes before it happens.

## Changing this document

By pull request, like any other change. The maintainer merges it once the
discussion is settled.
