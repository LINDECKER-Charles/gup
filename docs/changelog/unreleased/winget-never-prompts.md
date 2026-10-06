# winget-never-prompts

## Fixed

- **providers/os:** a winget package whose manifest requires an install folder (Battle.net) no
  longer holds the batch: the embedded terminal let winget read a reply, so it waited at
  "Specify the install root" until the package was skipped by hand — 15 minutes in one run.
  Every winget call now carries `--disable-interactivity`, and `0x8A15005F` ends as a skip that
  names the `winget upgrade --id <id> --location <folder>` to run, as `0x8A150042` did before the
  embedded terminal (`fix(providers/os): never let winget stop on a prompt`)

## Internal

- **core/update:** `UpdateOptions.unattended` and `UpdateDecisions.unattended` are gone: winget
  was their only reader, and it now refuses prompts in every run
  (`fix(providers/os): never let winget stop on a prompt`)
