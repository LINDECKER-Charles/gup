# Fragment — `feat/scheduled-updates`

Scheduled updates of chosen packages — never a whole provider — run by a
short-lived `gup` the OS starts every 15 minutes while a schedule is enabled,
managed with `gup schedule` or from the menu's Planification view. Design note:
[`../../development/design/scheduler.md`](../../development/design/scheduler.md);
guide: [`../../guide/scheduled-updates.md`](../../guide/scheduled-updates.md).

## Added

- **cli:** `gup schedule add|list|status|remove|enable|disable|run-now|install|uninstall`: schedule `provider:paquet` targets daily, weekly, monthly or with a 5-field cron (at most hourly), see the next and last runs (`--json` for scripts), run one now on the terminal, register or remove the OS trigger; a bare provider is refused with an example ([`dc62333`](https://github.com/LINDECKER-Charles/gup/commit/dc62333))
- **cli:** The hidden `gup __schedule-tick` the OS trigger starts: boot grace, captured environment on macOS/Linux, install timeout clamped to 30 minutes, installers' output to the log, graceful stop on SIGTERM and kin, a watchdog under Task Scheduler's 3-hour limit ([`dc62333`](https://github.com/LINDECKER-Charles/gup/commit/dc62333))
- **cli:** `gup doctor` reports the scheduler's trigger in its "Système" section ([`dc62333`](https://github.com/LINDECKER-Charles/gup/commit/dc62333))
- **core/scheduler:** Schedules evaluated in local time with croner, missed windows collapsed into one catch-up run, re-arming on edit and enable ([`5e368f1`](https://github.com/LINDECKER-Charles/gup/commit/5e368f1)); runs that scan only the needed providers and update through the shared pipeline, never elevated, never forced, never prompting, skipping rows that stand for a whole provider ([`3e206d1`](https://github.com/LINDECKER-Charles/gup/commit/3e206d1), [`f060fac`](https://github.com/LINDECKER-Charles/gup/commit/f060fac))
- **core/scheduler:** The OS trigger — a per-user Task Scheduler task launched through `conhost --headless`, a launchd user agent, or a managed crontab block — registered only while a schedule is enabled, repaired at start when it points at a gup that moved ([`e0df2a9`](https://github.com/LINDECKER-Charles/gup/commit/e0df2a9), [`2b537ef`](https://github.com/LINDECKER-Charles/gup/commit/2b537ef), [`c08a890`](https://github.com/LINDECKER-Charles/gup/commit/c08a890))
- **ui:** French vocabulary of schedules and runs, shared by the command line and the menu ([`605a59d`](https://github.com/LINDECKER-Charles/gup/commit/605a59d))
- **ui:** A Planification view in the menu: the trigger's state (`i` repairs it), each schedule's recurrence, next and last run, the last run package by package; edit, switch on/off, delete, run now; an editor with the next runs previewed as you type and every problem under its field; the OS trigger registered only after a one-time consent ([`315c23f`](https://github.com/LINDECKER-Charles/gup/commit/315c23f), [`68574b2`](https://github.com/LINDECKER-Charles/gup/commit/68574b2))
- **ui:** `p` in Paquets schedules the checked packages — in a new schedule or an existing one — and leaves out, with the reason, a row that stands for a whole provider; `◷` marks the packages a schedule covers, the sidebar flags an unseen failed run ([`315c23f`](https://github.com/LINDECKER-Charles/gup/commit/315c23f))
- **cli:** A menu "run now" updates through the menu's launcher (the run view, or the terminal) and becomes the schedule's last run either way ([`d0e3e70`](https://github.com/LINDECKER-Charles/gup/commit/d0e3e70), [`68574b2`](https://github.com/LINDECKER-Charles/gup/commit/68574b2))

## Changed

- **cli:** `gup update` and the menu wait, with a message, while a scheduled run is updating, instead of driving the same package managers at once ([`dc62333`](https://github.com/LINDECKER-Charles/gup/commit/dc62333))

## Security

- **core/scheduler:** The registered command is the realpath'd node and global gup, by absolute path, least privilege, no shell; paths a format would re-interpret are refused, XML is escaped, the crontab is never overwritten when it could not be read, and the environment captured for launchd/cron is an allowlist without credentials ([`e0df2a9`](https://github.com/LINDECKER-Charles/gup/commit/e0df2a9), [`2b537ef`](https://github.com/LINDECKER-Charles/gup/commit/2b537ef))

## Documentation

- **docs:** Scheduled-updates guide, with the menu's Planification view and the `p` gesture; scope ("not an agent") and uninstall instructions reworded for the opt-in trigger; scheduler design note with the Windows Task Scheduler spike and the menu's architecture

## Internal

- **core/config:** Section readers for records (`text`, `objects`, `kindOf`) and a per-store file size bound, for the schedules file ([`e9a6f4d`](https://github.com/LINDECKER-Charles/gup/commit/e9a6f4d), [`63e9b59`](https://github.com/LINDECKER-Charles/gup/commit/63e9b59))
- **core/scheduler:** Machine-local persistence of schedules, run state and the install record ([`303dd38`](https://github.com/LINDECKER-Charles/gup/commit/303dd38)); schedules edited in place, re-read on demand, runs marked seen ([`dee6eb6`](https://github.com/LINDECKER-Charles/gup/commit/dee6eb6))
- **core/scheduler:** Time, month-day and name helpers, the preview size and the winget UAC warning shared by the command line and the menu ([`08c249d`](https://github.com/LINDECKER-Charles/gup/commit/08c249d))
- **core/scheduler:** Opt-in (`GUP_MUTATE=1`) Windows integration test: a uniquely named `gup-it-*` task created, read back, run headless and deleted ([`2b537ef`](https://github.com/LINDECKER-Charles/gup/commit/2b537ef))
