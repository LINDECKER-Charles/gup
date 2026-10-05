# brew-delegated-duplicates

## Added

- **providers:** the row of a tool a provider follows but a package manager installed names that
  manager, `installedBy` (`brew`, `scoop`, `choco`, `winget`, `apt`, `dnf`), next to its `via …`
  note — 51 delegating providers, from Starship to Terraform; `gup list --json` carries it
  (`feat(providers): name the manager a delegated update goes through`)

## Fixed

- **core:** a tool Homebrew installed is listed once, by `brew`, once brew scanned: the tool's
  own row (Starship, Terraform, the Symfony CLI…) gives way to brew's. Both rows ran the same
  `brew upgrade`, so a formula brew could not install — the Symfony CLI's tap formula, behind
  Command Line Tools older than macOS 27 — failed twice in one run; and a release the provider read
  upstream before the formula packaged it came back after every update, a success that changed
  nothing (`fix(core): leave tools Homebrew installed to brew's own row`)
