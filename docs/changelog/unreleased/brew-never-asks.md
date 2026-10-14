# brew-never-asks

## Fixed

- **providers:** a Homebrew upgrade no longer stops on "Do you want to proceed with the upgrade?
  [y/n]". Since Homebrew 6.0, ask mode is the default: an upgrade that also moves another package
  (a dependent, a new dependency, `dotnet` pulling `powershell`) asks first whenever it has a
  terminal, and the embedded terminal is one, so a package already checked in gup waited for a
  `y`. Every `brew upgrade` gup runs — `brew`, `brew-cask`, a tool delegated to Homebrew and
  `wsl-brew` — now sets `HOMEBREW_NO_ASK=1`; the variable rather than `--yes`, which a Homebrew
  older than 6.0 refuses (`fix(providers): never let brew wait on its own confirmation`)

## Internal

- **core:** `runInherit` takes `env`, variables added to the inherited environment, in every
  install sink: execa merges them over gup's own, and the PTY sink hands them to the trampoline's
  environment rather than its payload. `sanitizeEnv` refuses a non-portable name or a value the
  argv barrier would refuse (`feat(core): let an install add variables to its environment`)
