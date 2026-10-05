# root-owned-state-dir

## Fixed

- **core/update:** on macOS and Linux, a lock folder gup may not write ends the update with its
  error, where `listen` answering EACCES counted as a holder: the run reported an unknown
  "another gup" and waited for it forever. EACCES still means a held pipe on Windows only
  (`fix(core/update): fail on a lock dir gup may not write instead of waiting`)
