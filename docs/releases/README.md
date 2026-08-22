# Release notes

One file per published version. Each file is the source text of the matching
GitHub Release: the body on GitHub is this file plus the "What's Changed" /
"Full Changelog" block GitHub generates at publication. For the exhaustive,
commit-level view of the same versions, see [`../changelog/`](../changelog/README.md).

| Version | Published | Notes | GitHub Release | npm |
|---|---|---|---|---|
| `0.3.2` | 2026-08-09 | [`0.3.2.md`](0.3.2.md) | [0.3.2](https://github.com/LINDECKER-Charles/gup/releases/tag/0.3.2) | [0.3.2](https://www.npmjs.com/package/@charles_lindecker/gup/v/0.3.2) |
| `0.3.1` | 2026-08-08 | [`0.3.1.md`](0.3.1.md) | [0.3.1](https://github.com/LINDECKER-Charles/gup/releases/tag/0.3.1) | [0.3.1](https://www.npmjs.com/package/@charles_lindecker/gup/v/0.3.1) |
| `0.3.0` | 2026-08-08 | [`0.3.0.md`](0.3.0.md) | [0.3.0](https://github.com/LINDECKER-Charles/gup/releases/tag/0.3.0) | [0.3.0](https://www.npmjs.com/package/@charles_lindecker/gup/v/0.3.0) |
| `0.2.2` | 2026-07-03 | [`0.2.2.md`](0.2.2.md) — reconstructed | — never tagged | [0.2.2](https://www.npmjs.com/package/@charles_lindecker/gup/v/0.2.2) |
| `0.2.1` | 2026-06-22 | [`0.2.1.md`](0.2.1.md) | [0.2.1](https://github.com/LINDECKER-Charles/gup/releases/tag/0.2.1) | [0.2.1](https://www.npmjs.com/package/@charles_lindecker/gup/v/0.2.1) |
| `0.2.0` | 2026-05-28 | [`0.2.0.md`](0.2.0.md) | [0.2.0](https://github.com/LINDECKER-Charles/gup/releases/tag/0.2.0) | [0.2.0](https://www.npmjs.com/package/@charles_lindecker/gup/v/0.2.0) |
| `0.1.1` | 2026-05-20 | [`0.1.1.md`](0.1.1.md) | [0.1.1](https://github.com/LINDECKER-Charles/gup/releases/tag/0.1.1) | [0.1.1](https://www.npmjs.com/package/@charles_lindecker/gup/v/0.1.1) |
| `0.1.0` | 2026-05-19 | [`0.1.0.md`](0.1.0.md) | [0.1.0](https://github.com/LINDECKER-Charles/gup/releases/tag/0.1.0) | [0.1.0](https://www.npmjs.com/package/@charles_lindecker/gup/v/0.1.0) |

"Published" is the npm publication date (UTC). The git tag of each version
points at its `chore(release): <version>` commit, except `0.1.0` (the commit
that made the package public) and `0.3.0` / `0.3.1` (a docs commit made right
after the bump, the same day).

## Provenance

- `0.3.0` onwards — written in this folder before tagging, committed with the
  release.
- `0.2.0`, `0.2.1` — written in a gitignored `release/` folder at the root and
  pasted into the GitHub Release. Imported here on 2026-08-22, byte-for-byte
  (hence in French: they are kept as published rather than rewritten).
- `0.1.0`, `0.1.1` — had no in-repo source at all. Imported from the GitHub
  Release body on 2026-08-22; `0.1.0` was reformatted (the original was
  indented as a code block and its fence never closed), the content is
  unchanged.
- `0.2.2` — published to npm on 2026-07-03 with no tag, no GitHub Release and
  no notes. [`0.2.2.md`](0.2.2.md) is reconstructed from the two commits
  between `0.2.1` and the version bump, and says so.

## Writing the next one

1. Create `docs/releases/<version>.md` on the release branch, in English.
   Shape used since `0.3.0`: a one-paragraph **TL;DR** with the install line,
   one section per theme, then **Tests**, **Verification** (the full check
   table, with the Node/npm versions it ran on), **Upgrade** (breaking changes
   or "drop-in"), and **Compare** (`<prev>...<version>` link).
2. Commit it with the `chore(release): <version>` bump, tag, publish.
3. Paste the file as the GitHub Release body and let GitHub append its
   generated block; do not edit the body by hand afterwards, edit the file.
4. Add the row above and the matching [`../changelog/<version>.md`](../changelog/README.md).
