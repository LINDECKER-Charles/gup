<!-- Changelog fragment of `docs/open-source-community`, folded into
     `docs/changelog/unreleased.md` before the release. -->

## Documentation

- Remove `.github/RELEASE_NOTES_v0.1.1.md`, a duplicate of `docs/releases/0.1.1.md` that nothing referenced, and correct the provenance of the 0.1.1 notes, which said they had no in-repo source (`docs: remove the duplicated 0.1.1 release notes from .github`)
- Fix the table of contents of the CLI reference, whose "Interactive menu" entry pointed to an anchor that no longer existed since the section became "Interactive app" (`docs: fix the interactive app anchor in the CLI reference`)
- Add `docs/development/releasing.md`: versioning, pre-flight, changelog and release notes, checks, tag, npm publish from a clean checkout of the tag, GitHub Release, landing check and hotfixes, with a release-flow diagram; linked from the release notes index (`docs: add the release guide`)
- **community:** Add `SUPPORT.md` (what to check first, which form to use, what to include, what to expect from a single-maintainer project) and `GOVERNANCE.md` (maintainer-led model, roles, how decisions and breaking changes are made, dependency and release policies, continuity) (`docs(community): add support and governance guides`)
- **community:** Add GitHub issue forms for bug reports, feature requests, new providers and questions, with blank issues disabled and chooser links to private vulnerability reporting, the documentation and `SUPPORT.md`; a pull request template carrying the contribution checklist; and a `CODEOWNERS` file that requests the maintainer's review on every pull request (`docs(community): add issue forms, PR template and CODEOWNERS`)
