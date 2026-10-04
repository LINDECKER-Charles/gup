# interface-language

## Documentation

- **guide:** The README and the user guides describe the interface gup now speaks by default:
  every label, key hint, message and dialog they quote is the English text, with the French one
  beside it only where a French user needs it to find a control (the sidebar, BEHAVIOR/CONFORT),
  and the screenshots' alt texts name the English views. They also document the language itself:
  choosing French at install by chaining `&& gup language fr` (Windows PowerShell 5.1 runs the
  two commands one after the other), `gup language [code]` and its exit codes, `GUP_LANG` and its
  precedence over the `interface.language` setting, the Options › Language row, what follows the
  language — the help, dates and numbers, the HTML report — and what does not, JSON and CSV
  fields; troubleshooting gains an entry for a language that does not apply, and the CLI reference
  no longer says the output is French
  (`docs(guide): describe the English interface and gup language`)
- **guide:** Updating gup itself says what changes on Windows: a running gup keeps OpenTUI's
  renderer and node-pty's ConPTY loaded, and Windows does not replace a loaded DLL, so gup leaves
  its own update for after it exits — its row in Packages cannot be checked,
  `gup update npm-g:@charles_lindecker/gup` ends as a skip, and the app prints
  `npm install -g @charles_lindecker/gup@latest --allow-scripts=node-pty` as it quits; the
  interactive app guide, the CLI reference and troubleshooting say so where a user meets it, and
  macOS and Linux keep updating gup like any package
  (`docs(guide): say how gup updates itself on Windows`)
- **guide:** Troubleshooting explains the update outcomes 0.5.1 changes, quoting what gup prints:
  a pip upgrade undone because `pip check` says it breaks a dependent (and the `pip install`
  that puts the old version back when gup could not), a `pnpm self-update` the `PATH` did not pick
  up (`$PNPM_HOME/bin`), the two winget failures that end as a skip with no retry offered
  (`0x8A150114`, `0x8A150042`), and software two providers list kept with one of them
  (`gup log --grep superseded`). The providers catalog gives `self:pnpm` its real command,
  `pnpm self-update` (it said `pnpm add -g pnpm`), and notes the pnpm-g, pip, composer-g,
  `self:gh` and Visual Studio changes (`docs(guide): cover the pip, pnpm and winget update outcomes`)
- **development:** The contributor docs describe the two interface languages. The documentation
  conventions give the rule for user-facing strings — both languages, `localized()` catalogs and
  `localize()`, English as the reference type, text read where it is shown and never while a
  module loads, the startup guard test — and say the docs quote the English interface; the
  architecture page gains §15 on `src/core/i18n/` and where each process takes its language
  (`cli.ts` before the program is built, the elevated child and the PTY trampoline from their
  payload); the walkthrough covers `gup language`, `format.ts` in place of `fr-format.ts` and the
  English UI; CONTRIBUTING says how a provider words a hint or a message (`MANUAL_STEPS`,
  `_template.ts`); SECURITY.md adds the language to the elevated child's validated payload;
  testing.md says the suites speak French; the Windows checklist adds the language and gup's own
  update (`docs(development): document the interface language for contributors`)
- **website:** The website page follows the landing's 0.5.1 demo: the TUI mocks are no longer
  "French on purpose" — the French page shows the French interface and the seven others the
  English one, chosen by `interfaceLanguageOf()` — the scenes-truth examples are the English ones,
  each variant is checked against its own language's `localized()` blocks, a view's label may be
  a getter, and the test fails when the scenes do not cover exactly the CLI's languages; the
  quality gates add `verify`'s check of each prerendered demo's `lang`, and the translation record
  drops the Chinese caption's "目前" (for now), which the copy no longer has
  (`docs(website): show the terminal demo in the page's language`)
- **community:** `SUPPORT.md` says the interface speaks English, and French with
  `gup language fr`, where it said French; the pull request template asks for user-facing strings
  in both languages, through `localize()` or a `localized()` catalog read when shown, where it
  asked for French ones (`docs(community): say the interface speaks English and French`)
