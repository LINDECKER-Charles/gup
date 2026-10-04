# Fragment — `feat/journal-settings`

The journal's settings in the Options view — how much the debug log records, the period the
Journal opens on, whether reports open in the browser — and the last hand-offs of the
observability lane: `o rapport HTML` on the update results, schedules named in the Journal, text
charts drawn with the chosen symbols. Design note:
[`../../development/design/journal-settings.md`](../../development/design/journal-settings.md);
guide: [`../../guide/journal-and-reports.md`](../../guide/journal-and-reports.md#settings).

## Added

- **ui:** Options › JOURNAL: `Journal de debug` (`OFF` to `trace`), `Période du journal` and `Ouvrir le rapport`, saved and applied at once, reset by `Réinitialiser… › Tout`; the level's row says when `--log-level` or `GUP_LOG_LEVEL` decide instead ([`f5cbfa3`](https://github.com/LINDECKER-Charles/gup/commit/f5cbfa3))
- **core/config:** `log.level` and `journal.period` / `journal.openReport` in `config.json`, their invalid values reported at startup and by `gup doctor` like every section's ([`22c658b`](https://github.com/LINDECKER-Charles/gup/commit/22c658b))
- **cli:** The debug log's level follows `--log-level` > `GUP_LOG_LEVEL` > `log.level` > `info`; a level changed in Options applies at once to the running menu (`log.threshold` is recorded); `gup doctor` and the Debug tab name the source `réglage` ([`6b18bc6`](https://github.com/LINDECKER-Charles/gup/commit/6b18bc6))
- **cli:** `gup report --open` opens the HTML report whatever the setting, even without a terminal ([`ad990c9`](https://github.com/LINDECKER-Charles/gup/commit/ad990c9))
- **ui:** `o rapport HTML` on the results of an update run in the menu: the report of the Journal's period, which ends with that run; views can add such keys to the results ([`a6f31e0`](https://github.com/LINDECKER-Charles/gup/commit/a6f31e0))
- **ui:** The Journal's event detail names the schedule an update ran for ([`f83ce5b`](https://github.com/LINDECKER-Charles/gup/commit/f83ce5b))

## Changed

- **cli:** An HTML report written for you opens in the browser only when `journal.openReport` is on (the default): the Journal's `o` and HTML export, and `gup report` from a terminal outside CI ([`ad990c9`](https://github.com/LINDECKER-Charles/gup/commit/ad990c9))
- **cli:** `gup report --format text` draws its charts with the symbols chosen in Options › Symboles (`interface.glyphs`) rather than always deciding by itself ([`ad990c9`](https://github.com/LINDECKER-Charles/gup/commit/ad990c9))
- **ui:** The Journal shows the period chosen in Options each time it comes to the front, until `p` picks another ([`f5cbfa3`](https://github.com/LINDECKER-Charles/gup/commit/f5cbfa3))
- **ui:** With the debug log off, the Debug tab says how to turn it back on given what turned it off ([`6b18bc6`](https://github.com/LINDECKER-Charles/gup/commit/6b18bc6))

## Security

- **cli:** The elevated helper never reads the log level setting: it keeps taking its parent's threshold from the batch payload; `gup log` does not read it either ([`6b18bc6`](https://github.com/LINDECKER-Charles/gup/commit/6b18bc6))
