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

## Internal

- **core/i18n:** `startup-reads.test.ts` loads every module of the command line with no language
  chosen yet and fails on any text read while modules load — a label captured then would stay in
  English for a French user; the suites keep asserting the French texts, unchanged byte for byte
  (`c9062ed`, `50e4433`)
- **landing:** the scenes test reads the sidebar's labels from the French catalogs (`1e0377f`)
- **cli:** the menu state's unused helpers are gone (`cc53172`)
- The HTML report's docs picture is taken in English (`a40089d`)
