# landing-i18n-redesign

## Added

- **landing:** the site is translated and prerendered per language, English at `/gup/`
  (`x-default`) and French at `/gup/fr/`, with a language menu, reciprocal `hreflang` in every
  head and in the sitemap, per-language Open Graph cards and a per-language JSON-LD graph whose
  FAQ is now visible on the page.
- **landing:** build-time i18n: catalogs resolved in Node (placeholders, CLDR plurals, inline
  markup), shipped to the client as resolved strings — no i18n runtime, no catalog in the bundle.
- **landing:** right-to-left layout and system font stacks for Han, Devanagari, Bengali and
  Arabic scripts, ready for the remaining languages.
- **landing:** production Content-Security-Policy, generated 404 linking every language.

## Changed

- **landing:** concise page: hero with a structured mock of the full-screen interface, then
  features, coverage, how it works, security, FAQ and install; the intro curtain, the scroll
  stage and the decorative motion are gone.
- **landing:** contrast-safe colour tokens (WCAG AA pinned by tests; the primary button now uses
  dark ink on violet) and logical CSS properties throughout.
- **landing:** feature copy for in-interface updates, multi-select, per-package schedules, the
  activity journal and HTML report, readable themes and OS-aware providers; "0 daemon ·
  planification opt-in" replaces "0 daemon · 0 polling"; `llms.txt` lists the languages.

## CI

- **pages:** every push and pull request touching the site builds it, runs the unit tests, the
  Playwright verify suite and a Lighthouse audit (≥ 0.95 on all four categories); deployment
  only happens for a published release or a manual dispatch.

## Documentation

- **docs:** `docs/development/website.md` — how the site is built, the i18n workflow, the
  glossary and the quality gates.
