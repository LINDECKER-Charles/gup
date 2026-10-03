# Fragment — `feat/debug-log`

A debug log of every gup run — the commands it spawns, the updates it attempts, why something
failed — readable with `gup log` and exportable as a redacted diagnostic archive for a bug
report. Design note: [`../../development/design/debug-log.md`](../../development/design/debug-log.md);
guide: [`../../guide/journal-and-reports.md`](../../guide/journal-and-reports.md).

## Added

- **cli:** Keep a debug log of every run (menu, commands, scheduled runs, the elevated batch): one JSON line per event in a daily file of the logs directory, levels `error` to `trace` (default `info`), chosen with `--log-level` or `GUP_LOG_LEVEL`; `off` writes nothing at all; a scheduled run logs at least `info`; files kept 14 days (`GUP_LOG_RETENTION_DAYS`), split past 10 MB; `gup doctor` shows the level, its source and the directory ([`7686051`](https://github.com/LINDECKER-Charles/gup/commit/7686051), [`8fe5a0d`](https://github.com/LINDECKER-Charles/gup/commit/8fe5a0d))
- **core/log:** Record every command gup runs (probes at `debug` with the end of a failed probe's error output, installs at `info`) and every update run (plan, attempts and outcomes, elevated batch, cancellations, waits), each line naming its provider and package ([`ed99827`](https://github.com/LINDECKER-Charles/gup/commit/ed99827))
- **cli:** `gup log [show]` prints the newest lines (`-n`, `--level`, `--since`, `--grep`, `--json`), `gup log path` the log directory ([`3762201`](https://github.com/LINDECKER-Charles/gup/commit/3762201), [`b0f0b7c`](https://github.com/LINDECKER-Charles/gup/commit/b0f0b7c))
- **cli:** `gup log export` writes a diagnostic `.zip` (log of the period, machine description, README) in the reports directory or at `--out`, redacted again on the way in; nothing is uploaded ([`6e7835b`](https://github.com/LINDECKER-Charles/gup/commit/6e7835b), [`4e8652f`](https://github.com/LINDECKER-Charles/gup/commit/4e8652f))

## Security

- **core/log:** Secrets are masked before anything reaches the log — URL credentials, any setting, variable or query parameter named like a secret (`password=`, `NPM_TOKEN=`, `.npmrc` `_authToken=`, `AWS_SECRET_ACCESS_KEY=`, Azure `AccountKey=`, SAS `sig=`, quoted JSON values), `Authorization` headers, GitHub/npm/GitLab/Slack/PyPI/NuGet tokens, AWS and Google keys, JWTs, private keys, secret flag values — in data keys as in values, and the home directory is shortened to `~`, with linear-time patterns; the environment is read through an allowlist only ([`8fe5a0d`](https://github.com/LINDECKER-Charles/gup/commit/8fe5a0d), [`fb64d7e`](https://github.com/LINDECKER-Charles/gup/commit/fb64d7e), [`c7329df`](https://github.com/LINDECKER-Charles/gup/commit/c7329df), [`4e8652f`](https://github.com/LINDECKER-Charles/gup/commit/4e8652f))
- **ui:** `gup log` drops the escape sequences and control characters a tool printed, so a log line never drives the terminal it is shown on ([`0ea165f`](https://github.com/LINDECKER-Charles/gup/commit/0ea165f))
- **core/log:** The elevated batch never writes into the user's log directory (CWE-59): its records travel back with its outcomes and the unelevated parent validates and writes them ([`bc992dc`](https://github.com/LINDECKER-Charles/gup/commit/bc992dc))
- **core/history:** Known secret shapes in update messages and scan errors are masked when the history is written; paths stay verbatim ([`afb4095`](https://github.com/LINDECKER-Charles/gup/commit/afb4095))
