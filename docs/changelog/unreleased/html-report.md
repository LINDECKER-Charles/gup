# Fragment — `feat/html-report`

The activity history as a polished, self-contained HTML report that opens in the browser:
`gup report` writes it by default, `o` opens it from the Journal view. Design note:
[`../../development/design/html-report.md`](../../development/design/html-report.md); guide:
[`../../guide/journal-and-reports.md`](../../guide/journal-and-reports.md#in-the-browser-the-html-report).

## Added

- **report:** A one-file, offline HTML report in French: an overview (a sentence for the period, key numbers linking to their details, the latest weeks' calendar, attempts per week or month, outdated packages over time, failures to watch, most updated packages, providers), a calendar per year navigable with the keyboard, a sortable and searchable packages table with a drawer per package (installed versions, every attempt and its message, copy the identifier), failures grouped by message, sessions by day with outcome and provider filters; light, dark and auto themes at WCAG AA, print of every page, a data table behind every chart, Back closes the drawer ([`6111288`](https://github.com/LINDECKER-Charles/gup/commit/6111288))
- **cli:** `gup report` writes the HTML report by default — to the reports directory, or `--out` — and opens it in the default browser from a terminal outside CI; `--no-open` keeps it closed, `--out -` prints it; an unopenable browser leaves the command successful with the file's address; `report.open` is logged ([`e4783cb`](https://github.com/LINDECKER-Charles/gup/commit/e4783cb))
- **ui:** The Journal view opens the period's HTML report with `o` (every tab) and offers it first in the `e` export dialog, saying whether the browser opened it ([`db86233`](https://github.com/LINDECKER-Charles/gup/commit/db86233))
- **core/export:** The report's data model: providers, packages, runs and failures as tables, free text interned once, the newest 50 000 attempts as tuples (2.2 MB of JSON), the rest counted ([`7dfff9f`](https://github.com/LINDECKER-Charles/gup/commit/7dfff9f)); opening a written file with the platform's own launcher — `explorer.exe` by absolute path, `/usr/bin/open`, `xdg-open`, `wslview` under WSL — through the runner, never a shell ([`f3df3ec`](https://github.com/LINDECKER-Charles/gup/commit/f3df3ec))
- **ui:** `periodLead()` words a period at the head of a sentence ([`cc83e91`](https://github.com/LINDECKER-Charles/gup/commit/cc83e91))

## Changed

- **cli:** `gup report` defaults to `--format html` (it was `text`); `text`, `json` and `csv` still go to the standard output ([`e4783cb`](https://github.com/LINDECKER-Charles/gup/commit/e4783cb))

## Security

- **report:** The report runs only its own script and stylesheet (CSP by SHA-256, `default-src 'none'`, Trusted Types required), loads nothing, names no URL in its script, carries the history as escaped JSON and builds its DOM node by node with allow-listed attributes: history text that looks like markup is shown as text. Free text is redacted again (secrets, home → `~`). A test lints the shipped script for sinks and limits ([`6111288`](https://github.com/LINDECKER-Charles/gup/commit/6111288), [`7dfff9f`](https://github.com/LINDECKER-Charles/gup/commit/7dfff9f))
- **core/export:** `explorer.exe` never receives a path with a comma or a quote (its parser splits there), nor a relative one ([`f3df3ec`](https://github.com/LINDECKER-Charles/gup/commit/f3df3ec))
