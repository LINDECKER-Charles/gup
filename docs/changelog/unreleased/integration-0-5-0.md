# Fragment — `chore/integration-0-5-0`

What the integration of the wave-2 branches fixed once they ran together: the commits made on the
integration branch itself, merge commits aside. The branches' own changes are in their fragments.

## Fixed

- **core/scheduler:** A "run now" started from Planification is dated at its last update, not when the user leaves the run view's results screen: the in-screen launcher only hands its report back then, so a 3 s run read "18,5 s" after a look at the results ([`801f7a9`](https://github.com/LINDECKER-Charles/gup/commit/801f7a9))
- **ui:** The key-hint bar keeps the global keys (`tab menu · q quitter`, the picker's `q annuler`) whole on a terminal too narrow for every hint: it drops the screen's last hints, marked `…`, instead of cutting the line mid-word. Paquets with a package checked no longer fit 120 columns once `p planifier` joined its hints ([`7d1b34c`](https://github.com/LINDECKER-Charles/gup/commit/7d1b34c))
- **ui:** The title bar no longer says `à jour` before any scan result exists — with "Scanner au lancement" off, or while the launch scan runs ([`c9db93c`](https://github.com/LINDECKER-Charles/gup/commit/c9db93c))
- **cli:** Every line of `gup doctor`'s "Système" section shortens the home directory to `~`, as the log does; the configuration file was printed with the user name in its path ([`4bd531a`](https://github.com/LINDECKER-Charles/gup/commit/4bd531a))
- **cli:** `gup --help` no longer names only `list`, `update` and `doctor` as the commands that bypass the menu ([`a1499e4`](https://github.com/LINDECKER-Charles/gup/commit/a1499e4))
- **core/pty:** A failing ConPTY output worker (EPIPE after the pseudo-console closed) is logged instead of crashing gup with an uncaught exception ([`9c7703c`](https://github.com/LINDECKER-Charles/gup/commit/9c7703c))

## Internal

- **ui:** The French label modules are grouped by domain under `src/ui/text/` (`journal/`, `schedule/`, `settings/`), keeping the folder under its 10-file budget ([`01036d4`](https://github.com/LINDECKER-Charles/gup/commit/01036d4))
- **core/scheduler:** Scheduler exports that shared a name with another feature's are renamed (`RunNowControl`, `SCHEDULED_RUN_MESSAGES`, `listSchedulesCommand`, `ScheduleReportOptions`) ([`e645de8`](https://github.com/LINDECKER-Charles/gup/commit/e645de8))
- **report:** The unused `ThemeToken` type is gone ([`9c51fd8`](https://github.com/LINDECKER-Charles/gup/commit/9c51fd8))
