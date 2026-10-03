# Fragment — `feat/activity-journal`

The activity history, read back and drawn: a **Journal** view in the menu (activity heatmap,
per-package recurrence, every event, the debug log) and `gup report` for text charts, JSON or
CSV. Design note: [`../../development/design/activity-journal.md`](../../development/design/activity-journal.md);
guide: [`../../guide/journal-and-reports.md`](../../guide/journal-and-reports.md#activity-journal).

## Added

- **ui:** A Journal view in the menu, between Providers and Options: Activité (headline numbers, a GitHub-style calendar of successful updates, the outdated count day after day, the slowest scans), Récurrence (a bar per package with its typical interval and pace, details with the latest versions), Événements (every scan and attempt, type and text filters, full record), Debug (newest log lines, level filter, diagnostic archive); `1`–`4`/`[` `]` tabs, `p` period (30 days to everything), `r` reload, `e` export; fits 80 × 24, ASCII marks when the terminal needs them ([`dc4c470`](https://github.com/LINDECKER-Charles/gup/commit/dc4c470), [`c4bcac9`](https://github.com/LINDECKER-Charles/gup/commit/c4bcac9), [`e2bfe66`](https://github.com/LINDECKER-Charles/gup/commit/e2bfe66), [`b0b3e3a`](https://github.com/LINDECKER-Charles/gup/commit/b0b3e3a))
- **cli:** `gup report [--format text|json|csv] [--since] [--until] [--out] [--force] [--delimiter]` exports the activity of a period: text charts by default, a versioned JSON document (English snake_case fields) or a CSV of the update attempts; data on stdout, notices on stderr ([`213a972`](https://github.com/LINDECKER-Charles/gup/commit/213a972), [`78fedeb`](https://github.com/LINDECKER-Charles/gup/commit/78fedeb), [`8c66dad`](https://github.com/LINDECKER-Charles/gup/commit/8c66dad))
- **cli:** `gup log export` adds `history-summary.json`, the period's activity in figures (never the events themselves); `--no-history` leaves it out ([`1e84bf3`](https://github.com/LINDECKER-Charles/gup/commit/1e84bf3))
- **core/insights:** One aggregation of the history for every front-end: activity per day and week, per-package recurrence (median interval between successful updates, retries merged, cadence), per-provider times, the outdated trend from full scans, failures grouped by reason, runs, totals; 100 000 events read and aggregated in about 0.3 s ([`687e677`](https://github.com/LINDECKER-Charles/gup/commit/687e677), [`783c359`](https://github.com/LINDECKER-Charles/gup/commit/783c359))
- **core/history:** A strict reader of the history: known fields only, torn, foreign or newer lines counted and skipped, never fatal ([`a60e47e`](https://github.com/LINDECKER-Charles/gup/commit/a60e47e))
- **ui:** Each provider's own scan time is recorded in the history, and scans are written to the debug log (`scan.start`, `scan.provider`, `scan.end`) ([`e2f350f`](https://github.com/LINDECKER-Charles/gup/commit/e2f350f))
- **core/time:** Report periods (`7d`, `12w`, `6m`, `1y`, `all`, a date, `--until`) and local calendar days with Monday weeks ([`5821a9d`](https://github.com/LINDECKER-Charles/gup/commit/5821a9d))

## Security

- **core/export:** Exports redact free text again (secrets, home directory → `~`) and neutralise CSV cells that start like a spreadsheet formula ([`78fedeb`](https://github.com/LINDECKER-Charles/gup/commit/78fedeb))
- **core/history:** The history is read back without the escape sequences and control characters tools printed, so the journal never drives the terminal; a guard test keeps the reader and the insights imported by the journal, report and export front-ends only — they never feed a decision ([`c5cbb59`](https://github.com/LINDECKER-Charles/gup/commit/c5cbb59), [`a60e47e`](https://github.com/LINDECKER-Charles/gup/commit/a60e47e), [`f4a713f`](https://github.com/LINDECKER-Charles/gup/commit/f4a713f))

## Internal

- **cli:** `gup log --since` uses the shared period parser ([`a2976ba`](https://github.com/LINDECKER-Charles/gup/commit/a2976ba)); log lines are painted by the shared terminal-text helper ([`49d4f67`](https://github.com/LINDECKER-Charles/gup/commit/49d4f67)); line-length tidy-up ([`a27edc0`](https://github.com/LINDECKER-Charles/gup/commit/a27edc0))
