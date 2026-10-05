# root-owned-state-dir

## Added

- **cli:** `gup doctor`'s **File ownership** line checks gup's folders (settings, history, log,
  reports, schedules, update lock) and their files on macOS and Linux: `gup's folders are yours`,
  or one warning per entry another user owns — what an earlier run under sudo left to root — with
  the `sudo chown -R` that gives it back
  (`feat(cli): name the gup files another user owns in gup doctor`)

## Changed

- **cli:** gup refuses to start under sudo, as Homebrew does: `gup does not run under sudo: as
  root, it would leave files in your home folder that your user can no longer write, and
  Homebrew refuses to run as root. Run gup without sudo — it asks for your password itself when
  a package needs administrator rights.` (exit 1). The guard runs before anything is written, the
  debug log included; the `sudo gup __admin-batch` child gup starts itself, and root's own runs
  (a root shell, a container: no `SUDO_UID`), still run
  (`fix(cli): refuse to run under sudo, as Homebrew does`)

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
