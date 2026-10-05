# root-owned-state-dir

## Fixed

- **core:** a gup folder another user owns is named, with the command that gives it back. macOS's
  `sudo` keeps the user's HOME, so a gup run with sudo left `~/Library/Application Support/gup`
  to root, and every later run failed on a bare `EACCES: permission denied, mkdir '…/gup/locks'`
  — no update started — or `history not written — EACCES…`. Both now read
  `… belongs to root, not to you — gup was probably run with sudo. Give it back to your user:
  sudo chown -R <you> "$HOME/Library/Application Support/gup"`
  (`fix(core): name the folder root owns and how to give it back`)
- **core/update:** on macOS and Linux, a lock folder gup may not write ends the update with its
  error, where `listen` answering EACCES counted as a holder: the run reported an unknown
  "another gup" and waited for it forever. EACCES still means a held pipe on Windows only
  (`fix(core/update): fail on a lock dir gup may not write instead of waiting`)
