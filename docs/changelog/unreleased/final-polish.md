# Fragment — `fix/final-polish`

The last review of the 0.5.0 integration branch, fixed on top of it: one commit per fix, each
with its regression test where there is a behaviour to hold.

## Changed

- **ui:** The run results' key-hint bar reads `↑↓ choisir un paquet · entrée retour · o rapport HTML · v agrandir la sortie`: the keys other views add come before `v`, the first to go on a short bar, and "retour" no longer says "aux paquets" — a run started from Planification goes back there. The whole bar fits an 80-column terminal ([`69338b6`](https://github.com/LINDECKER-Charles/gup/commit/69338b6))
- **ui:** Planification's hint bar lists its keys most needed first — `entrée modifier · x exécuter · suppr supprimer`, then `espace`, `i déclencheur` and the arrows; the editor's starts with `ctrl+s enregistrer · entrée modifier · échap annuler`. At 80 columns, running, deleting and saving were cut off the bar ([`821476e`](https://github.com/LINDECKER-Charles/gup/commit/821476e))

## Fixed

- **core/config:** The Options view's "Fichier" row no longer says a setting is invalid once a save rewrote its section: the issues of a section go with the save, those of the file itself (a corrupt file's backup) stay ([`747d5d1`](https://github.com/LINDECKER-Charles/gup/commit/747d5d1))
- **ui:** The Scan view's per-provider durations stay inside the panel: the result column shrinks first, then the name, instead of laying the rows out 79 columns wide in a panel of 50 (80-column terminal) or 70 (100 columns); a cut name or result keeps a blank before the next column ([`0162ae3`](https://github.com/LINDECKER-Charles/gup/commit/0162ae3))
- **landing:** `llms.txt` lists glab under "Dev CLIs" and flutter under "Other languages", their domains, no longer under "Cloud CLIs" and "Embedded / mobile"; a rule test holds every category named after a domain to it ([`b94e4aa`](https://github.com/LINDECKER-Charles/gup/commit/b94e4aa))
- **landing:** The hero lead and the social description, in the eight languages, say updates run "in a terminal embedded in its interface" (the lead adds "live") instead of promising they never leave it: the Windows administrator batch has its own UAC window, and without an embedded terminal gup updates in the user's own terminal ([`437df6e`](https://github.com/LINDECKER-Charles/gup/commit/437df6e))

## Internal

- **ui:** `src/ui/app/menu-session.ts` (307 lines) and `src/ui/run/run-view.ts` (332) are back under the 300-line alert: the session, its navigation and view registry move to `src/ui/app/session/` with the key routing and hint bar split into `menu-keys.ts`; the embedded terminal's modules move to `src/ui/run/terminal/`, and the run view's pipeline events and levers (`s`, `x`, Ctrl+C, `t`) to `run-events.ts` and `run-levers.ts`. No behaviour change ([`6ea3890`](https://github.com/LINDECKER-Charles/gup/commit/6ea3890), [`f0d1a1f`](https://github.com/LINDECKER-Charles/gup/commit/f0d1a1f))
- **ui:** The diagnostic README's `system.json` line is wrapped under 100 columns in the source; the text is unchanged ([`80b8795`](https://github.com/LINDECKER-Charles/gup/commit/80b8795))
- **lint:** The registry's `max-lines` exception in `eslint.config.js` is justified in English, like every other comment ([`71efa1b`](https://github.com/LINDECKER-Charles/gup/commit/71efa1b))
