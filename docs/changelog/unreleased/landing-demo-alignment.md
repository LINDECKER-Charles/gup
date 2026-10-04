# landing-demo-alignment

## Added

- **landing:** each OS card states how many registered providers gup supports on that system
  (139 on Windows, 132 on macOS, 126 on Linux of 153 today), read at build time from the
  providers' `readonly platforms = PLATFORMS.<set>;` declarations; `llms.txt` and
  `llms-full.txt` give the same numbers.
- **landing:** `tests/rules/scenes-truth.test.mjs`, a drift detector between the terminal demo
  and the CLI's sources: the build's tests fail when a mock shows a label, a key hint or a mark
  the interface does not write, a sidebar the registered views do not build, or a provider the
  registry does not register.

## Fixed

- **landing:** the terminal demo draws the shipped interface — Paquets with its title bar facts,
  provider rows checking all/some/none of their packages, the `◷` of a scheduled package, the
  selection bar and the full key-hint bar; the run view with its progress line, provider and
  duration columns, a pane titled after the provider and the package, and the real key hints.
- **landing:** feature copy in the eight languages matches the release: updates leave the list
  without a rescan and fall back to the plain terminal when no pseudo-terminal is available,
  schedules start from `p` and run through a short gup process started by the OS scheduler, the
  report opens with `gup report` or `o` in the journal, and the contrast policy is stated
  exactly (WCAG AA: 4.5:1 text, 3:1 borders, 7:1 at AAA, colours corrected).
- **landing:** the FAQ and `llms.txt` no longer claim JetBrains plugins, Eclipse Marketplace,
  Obsidian or Notepad++ support — those providers are not registered; JetBrains IDEs are.

## Internal

- **landing:** the registry reading moves from `scripts/sync-facts.mjs` to the pure, tested
  `build/facts/read-registry.mjs`.

## Documentation

- **docs:** `docs/development/website.md` — derived per-system counts, what the scenes-truth
  test checks and does not, and the back-translation notes of the aligned copy.
