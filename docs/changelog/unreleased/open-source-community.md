<!-- Changelog fragment of `docs/open-source-community`, folded into
     `docs/changelog/unreleased.md` before the release. -->

## CI

- **docs:** Add the `docs` workflow: lychee checks every relative link and heading anchor of the Markdown files, offline and with read-only permissions, on pull requests and pushes that touch documentation; it is not a required check (`ci(docs): check Markdown links and anchors offline`)

## Documentation

- Remove `.github/RELEASE_NOTES_v0.1.1.md`, a duplicate of `docs/releases/0.1.1.md` that nothing referenced, and correct the provenance of the 0.1.1 notes, which said they had no in-repo source (`docs: remove the duplicated 0.1.1 release notes from .github`)
- Fix the table of contents of the CLI reference, whose "Interactive menu" entry pointed to an anchor that no longer existed since the section became "Interactive app" (`docs: fix the interactive app anchor in the CLI reference`)
- Add `docs/development/releasing.md`: versioning, pre-flight, changelog and release notes, landing facts, checks, tag, npm publish from a clean checkout of the tag, GitHub Release, landing check and hotfixes, with a release-flow diagram; linked from the release notes index (`docs: add the release guide`, `docs: align the release guide with the current release steps`, `docs: keep the release shell at the root for the facts sync`)
- **community:** Add `SUPPORT.md` (what to check first, which form to use, what to include, what to expect from a single-maintainer project) and `GOVERNANCE.md` (maintainer-led model, roles, how decisions and breaking changes are made, dependency and release policies, continuity) (`docs(community): add support and governance guides`, `docs(community): capture update output with -y in support and bug form`, `docs(community): state the actual dependency pins in GOVERNANCE`)
- **community:** Add GitHub issue forms for bug reports, feature requests, new providers and questions, with blank issues disabled and chooser links to private vulnerability reporting, the documentation and `SUPPORT.md`; a pull request template carrying the contribution checklist; and a `CODEOWNERS` file that requests the maintainer's review on every pull request (`docs(community): add issue forms, PR template and CODEOWNERS`, `docs(community): capture update output with -y in support and bug form`, `docs(community): drop the screenshots item from the PR template`)
- **community:** Add `CODE_OF_CONDUCT.md`, the Contributor Covenant 2.1 with a private e-mail contact for reports, and link it from the README, `CONTRIBUTING.md`, `SUPPORT.md`, `GOVERNANCE.md`, the docs index and the issue chooser (`docs: add the contributor covenant code of conduct`)
- Add a root `CHANGELOG.md` pointing to `docs/changelog/` (fragments included) and the release notes without naming a version, and a versionless `CITATION.cff` behind GitHub's "Cite this repository" (`docs: add a root changelog pointer and CITATION.cff`)
- Give `SECURITY.md` the sections a reporter looks for first: supported versions, private reporting through GitHub, best-effort response aims (acknowledge within 7 days, assess within 14, patch high and critical issues within 30), coordinated disclosure with credit, and what is in and out of scope; the threat model is unchanged (`docs: document supported versions and disclosure in SECURITY.md`)
- Document in `CONTRIBUTING.md` the ways to contribute, installing Node ≥ 26.9 through a version manager, the language rule, the enforced size and complexity limits with their named exceptions, branch naming, Conventional Commits and the full scope map (including `core/<module>`, `landing` and `docs(community)`), the pull request flow with its eight required checks, the documentation rules and the bug report form; the manual-only providers note names its comment instead of line numbers (`docs: document branches, scopes and the PR flow in CONTRIBUTING`, `docs: correct false and duplicated statements in CONTRIBUTING`)
- Fix the README's Node badge (≥ 26.9, was ≥ 24), add a Community section (contributing, support, security, governance) and link the release guide (`docs: fix the Node badge and add a community section to the README`)
- Refresh the docs index: a Community table for the root and `.github/` files, the release guide, the changelog fragments, a pointer to the Mermaid rules, and a reading map with the new pages (`docs: refresh the docs index and reading map`)

## Internal

- Drop the 11 commented template placeholders from `.github/FUNDING.yml`, keeping GitHub Sponsors and Ko-fi (`chore: drop template placeholders from FUNDING.yml`)
- Check SVG files out with LF line endings on every platform, so that byte-for-byte comparisons of generated screenshots do not flag a Windows checkout as stale (`chore: keep SVG files LF-only in checkouts`)
