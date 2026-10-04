# record-0-5-1-publication

## Documentation

- **docs:** 0.5.1 is recorded as published on 2026-10-04 (npm, UTC): its rows in the release
  notes and changelog tables and the title of its changelog gain the date, and the links to its
  GitHub Release and its npm version (`docs: record the 0.5.1 publication`)
- **releases:** the 0.5.1 notes link their changelog by absolute URL, and the release notes'
  README now asks for absolute links. A notes file becomes the body of its GitHub Release, where
  GitHub resolves a relative link against `/blob/` with no branch: 0.5.0's
  `../changelog/0.5.0.md` became `/blob/changelog/0.5.0.md`, a 404
  (`docs(releases): link the 0.5.1 changelog by absolute URL`)
- **development:** the release procedure titles the GitHub Release `gup x.y.z`, as the published
  releases are titled, where it said `x.y.z` (`docs(development): title GitHub Releases gup x.y.z`)
