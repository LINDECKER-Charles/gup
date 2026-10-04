# interface-language

## Added

- **core/i18n, cli:** gup speaks English or French, English by default. The language comes from
  `GUP_LANG`, then the new `interface.language` setting, then English — the machine's own locale
  is not consulted, and a `GUP_LANG` gup has no translation for is ignored and reported, never
  fatal. It is chosen in `cli.ts` before commander is built, so the help and the usage errors are
  already in it. `localized({ en, fr })` catalogs answer in the language active when they are read,
  English is their reference type (a French catalog missing a key or changing a signature does not
  compile), and `format.ts` (formerly `fr-format.ts`) writes numbers, plurals and dates the active
  language's way: `2026-10-03` and `Oct 03 14:22` in English (`c9062ed`, `4994f82`)
- **cli:** `gup language` says which language gup speaks and where that choice comes from;
  `gup language fr` saves it and confirms in it, so an install line can pick French:
  `npm install -g @charles_lindecker/gup --allow-scripts=node-pty && gup language fr`. `gup doctor`
  reports the language, Options has a Language row (first of BEHAVIOR) that applies at the next
  start, and the elevated child receives its parent's language in the batch payload; the
  embedded terminal's trampoline in its request (`ddc4a15`, `f709730`, `1afe6a0`)
- **cli:** the command line in English: commander's help and usage errors (in commander's own
  wording, behind `Error:`), `gup update`, `gup list`, `gup doctor`, `gup log`, `gup report`,
  `gup schedule`, their options and placeholders (`<level>`, `<seconds>`, `[targets...]`), and the
  plain terminal's update output and summary (`2fdc648`, `11e7b87`, `927bb26`, `ffb0e90`, `1cf0dee`)
- **ui:** the full-screen app in English: the menu, Scan, Packages, Providers, the run view and its
  dialogs (yes/no confirmations show `y yes · n no` and accept `y`, `o` and `n` in both languages),
  Schedules and its editor, the Journal and its charts, Options, the theme picker and the colour
  editor (`3e862ae`, `1a652b9`, `d55be7a`, `822dbc7`, `0863e49`, `1cf0dee`)
- **report:** the HTML report is written in the interface language: `<html lang>`, every label,
  plurals, numbers and dates formatted with `en-US` or `fr-FR` by the browser client, the same
  script and CSP hash in both (`53a9024`, `adeeb0f`)
- **providers:** install hints, notes, manual steps and failure messages of the 153 providers in
  English, the shared steps worded once in `providers/manual-steps.ts` (`eb6799b`)
- **core:** update outcomes, target checks, settings issues, scheduler messages and the history and
  debug log write notices in English; OS trigger artifacts keep their stable markers and carry
  constant English descriptions (`8105fba`, `afaa71b`, `720130e`, `1cf0dee`)

## Fixed

- **ui:** names sort the active language's way, never the machine's: the provider groups of
  Packages and the Scan list used a bare `localeCompare()`, so the same list came out in another
  order on another machine (`2da1756`)
- **ui:** the English texts read naturally where they first did not: a period between two dates
  reads "from … to …" (it read "Since … until …" in the report's sentence), and the colour
  editor's background sample fits its column (`35b90da`, `8254452`)

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
  update (`docs(development): document the interface language for contributors`); the screenshot
  notes and the macOS checklist then name the views Packages and Schedules
  (`docs(development): name the views by their English labels`)
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

## Internal

- **core/i18n:** `startup-reads.test.ts` loads every module of the command line with no language
  chosen yet and fails on any text read while modules load — a label captured then would stay in
  English for a French user; the suites keep asserting the French texts, unchanged byte for byte
  (`c9062ed`, `50e4433`)
- **landing:** the scenes test reads the sidebar's labels from the French catalogs (`1e0377f`)
- **cli:** the menu state's unused helpers are gone (`cc53172`)
- The HTML report's docs picture is taken in English (`a40089d`)
- **cli:** the end-to-end sandbox hands the built CLI the suites' language, which it used to
  drop with gup's other variables; two smoke tests run it in its default English and after
  `gup language fr` (`fb9dc2b`)
- **core/scheduler, cli:** the scheduler's English messages and the elevated batch's write
  failure are tested, which keeps both modules over their coverage floors (`1858674`, `1f1b448`)
- The pictures of the colour editor and the HTML report are retaken (`fecc860`)
