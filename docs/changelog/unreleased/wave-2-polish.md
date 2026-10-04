# Fragment — `fix/wave-2-polish`

The hand-offs of the wave-2 reviews, fixed on top of the integration branch: one commit per fix,
each with its regression test.

## Changed

- **ui:** A schedule's "run now" is confirmed once. With "Confirmer les MAJ" on, `x` no longer asks "Exécuter « X » maintenant ?" before its scan: the launcher's confirmation, which lists the packages found, is the only question. With the preference off, the run-now question stays ([`d5109ac`](https://github.com/LINDECKER-Charles/gup/commit/d5109ac))
- **ui:** `q` (and "Quitter") asks before ending the menu while the schedule editor holds changes not saved, the answer defaulting to "Non" ([`99434fc`](https://github.com/LINDECKER-Charles/gup/commit/99434fc))
- **ui:** While a dialog is open, the key-hint bar shows that dialog's keys instead of the screen's behind it — in the menu, in the run view and on the one-shot dialog screens — also when the dialog opens with no key pressed (the update confirmation once the embedded terminal is detected, a question of the update pipeline). While a panel takes typed text, the bar no longer offers `tab menu · q quitter` (nor the package picker its `q annuler`), keys the text field takes ([`f98314f`](https://github.com/LINDECKER-Charles/gup/commit/f98314f))
- **core/update:** The lock every update takes now lives in its own state directory (`%LOCALAPPDATA%\gup\locks`, `~/Library/Application Support/gup/locks`, `$XDG_STATE_HOME/gup/locks`), no longer in the scheduler's: an interactive update no longer recreates an empty scheduler folder after `gup schedule uninstall --purge`. With `GUP_SCHEDULER_DIR` set, the lock stays in that directory ([`5357b6e`](https://github.com/LINDECKER-Charles/gup/commit/5357b6e))

## Fixed

- **ui:** The Scan view and the summary line of `gup list` / `gup update` write durations the French way (`0,6 s`, `1 min 05 s`) like the rest of the interface, and the per-provider time column stays aligned past a minute ([`6d32dde`](https://github.com/LINDECKER-Charles/gup/commit/6d32dde))
- **ui:** Planification's notices (a trigger failure and its reason, the foreign-installation warning) and the Journal's export status wrap to the panel instead of being cut at 80 or 120 columns; the exported report's path reads from `~` and is cut in its middle only when it is still wider than the panel, so the file name always shows ([`af3de93`](https://github.com/LINDECKER-Charles/gup/commit/af3de93))
- **ui:** PageDown in the Providers view stops at the last full screen instead of scrolling until a single line is left ([`d533876`](https://github.com/LINDECKER-Charles/gup/commit/d533876))
- **ui:** "Une autre mise à jour gup est en cours" is worded once for the run view and the plain terminal, and the terminal dates it like the rest of the interface (`commencée il y a 4 min`) instead of with the machine's locale ([`bf262a6`](https://github.com/LINDECKER-Charles/gup/commit/bf262a6))
- **ui:** Planification's hint bar says `espace désactiver` on an enabled schedule and `espace activer` on a disabled one ([`1393b41`](https://github.com/LINDECKER-Charles/gup/commit/1393b41))
- **ui:** No update starts while a scan of the menu runs: both launchers refuse, and Planification's run-now says a scan is running instead of asking ([`1e656da`](https://github.com/LINDECKER-Charles/gup/commit/1e656da))
- **core/config:** A failed save of the settings is forgotten once a later one succeeds; the Options view's "Fichier" row shows the file's real state again, a failed save included ([`f248685`](https://github.com/LINDECKER-Charles/gup/commit/f248685))
- **core/scheduler:** A scheduled tick checks every enabled schedule it reads again: one edited by hand in `schedules.json` past the editor's rules (more often than hourly, a control character in its name) is never run, and is logged as `scheduler.schedule-invalid` ([`5fd5248`](https://github.com/LINDECKER-Charles/gup/commit/5fd5248))
- **core/scheduler:** On macOS, installing the trigger retries `launchctl bootstrap` (after 0.25, 0.5 and 1 s) while launchd answers `Bootstrap failed: 5` because it is still booting the previous agent out ([`e3178ea`](https://github.com/LINDECKER-Charles/gup/commit/e3178ea))
- **ui:** During the Windows administrator step, `t` says the elevated window is where to answer, instead of repeating `s`'s notice ([`17d26a5`](https://github.com/LINDECKER-Charles/gup/commit/17d26a5))
- **ui:** An update run inside the screen no longer leaves an appearance listener behind ([`bf4d679`](https://github.com/LINDECKER-Charles/gup/commit/bf4d679))
- **core/scheduler:** `gup schedule uninstall --purge` also deletes the copy of a corrupt `schedules.json` the settings store had set aside, so the scheduler folder goes ([`4499f76`](https://github.com/LINDECKER-Charles/gup/commit/4499f76))
- **core/state:** On Windows, two gup processes saving the same settings or schedules at once no longer fail a save with EPERM while one of them deletes its lock file ([`347ee76`](https://github.com/LINDECKER-Charles/gup/commit/347ee76))

## Documentation

- **docs:** The test-harness design note no longer lists the retired `providers-legacy` vitest project ([`25d3d70`](https://github.com/LINDECKER-Charles/gup/commit/25d3d70))
