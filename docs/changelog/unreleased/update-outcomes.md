# update-outcomes

Found in the debug log of a real run on Windows: updates gup called a success that changed
nothing, or broke something, and retries offered where none could work.

## Fixed

- **providers/python:** a pip upgrade that breaks an installed package depending on it is undone:
  `pip check` before and after names the requirement the upgrade broke (semgrep pins
  `click~=8.4.2`, pydantic pins `pydantic-core`), the previous version is reinstalled, and the
  outcome says which package and which requirement. pip exits 0 in that case; gup used to report
  a success, until a later upgrade put the old versions back (`3d3cfa5`)
- **providers/dotnet-php:** `composer global update <pkg> --with-dependencies`: a version that
  needs a newer dependency than the locked one (laravel/installer 5.32, laravel/prompts ^0.3.21)
  was refused with "Nothing to install, update or remove" and exit 0 (`729262e`)
- **providers/node:** the `pnpm` row of `pnpm-g` updates through `pnpm self-update`; pnpm answers
  `pnpm add -g pnpm@latest` with `ERR_PNPM_GLOBAL_PNPM_INSTALL` (`e2e7110`)
- **providers:** a `pnpm self-update` that leaves the pnpm on PATH at its old version is a
  failure that says to add `$PNPM_HOME/bin` (`%PNPM_HOME%\bin`) to PATH, where pnpm 11+ installs
  itself, instead of a success (`3430a27`)
- **providers/os:** winget failures no stronger tier can fix end as a skip that says what to do,
  no longer as an offer to force, uninstall or reinstall: an upgrade the manifest forbids
  (0x8A150114) and a question no flag answers (0x8A150042) (`af861de`)
- **core:** software two providers list stays with one: winget's Visual Studio editions go when
  the Visual Studio provider scanned — after it updated Visual Studio, winget's row failed with
  "no applicable upgrade" and offered to reinstall it — and `self`'s `gh` goes when winget lists
  `GitHub.cli` (`6d36c72`)

## Internal

- The duplicate-row rule's Visual Studio pattern carries the justification of its security lint
  exception: anchored, no nested repetition (`feb164d`)
