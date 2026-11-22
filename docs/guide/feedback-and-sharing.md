# Feedback and journal sharing

gup offers two independent ways to help its maintainer:

- **The feedback form** — report a bug or suggest an idea, at any time, from `gup feedback` or
  the app's **Feedback** view.
- **Journal sharing** — opt in once, and gup sends this machine's activity history and debug log,
  redacted, after the commands that write them. Off unless you say yes.

Both are tied to an **install ID**: an identifier gup creates the first time you act on feedback —
you say yes to sharing, open the form, ask for the ID or copy it. Looking at where things stand
(`gup feedback status`, `gup doctor`, the app's views) never creates it. Quote it in a report and
the maintainer can find the journals you shared.

## Reporting a bug or an idea

```bash
gup feedback            # print the install ID and the form's address, open the form
gup feedback --no-open  # the same, without opening the browser
gup feedback id         # the install ID alone, for a script or a paste
```

```text
Install ID: 3f2c8a4e-1b6d-4e2f-9a7c-5d8e0f1a2b3c
Feedback form: https://lindecker-charles.github.io/gup/?install=3f2c8a4e-…&version=0.6.0&platform=win32#feedback
Quote the install ID in a report: it links it to the journals you share.
```

The form opens on the landing site, in the interface's language (French under `/gup/fr/`),
already filled with the install ID, gup's version and the platform (`win32`, `darwin`, `linux`,
or `other`). The browser only opens when somebody can see it — a terminal, outside CI; otherwise,
or when it cannot be started, the address is all you get. The form does not need journal sharing:
you can report a bug without sharing anything.

In the app, the **Feedback** view shows the same: Enter opens the form, `c` copies the install ID.

## Sharing your journals

### The question

The first time you open the app, or run `gup update` or `gup list`, gup asks once:

```text
Help improve gup?

gup can send this machine's activity history and debug log to its maintainer, so the problems
you run into can be analysed. They are redacted the same way as gup log export: secrets removed,
your home folder shown as ~.

Never sent: your settings file, your environment.
Change it any time: gup feedback share on|off, or in Options.

Share your journals?                                   Yes   [No]
```

**No** is the highlighted answer and Escape answers no: the command you started goes on. Ctrl+C
answers no too, then stops the command, as it does at every prompt (exit code 130). The install ID
is created only once you say yes.

Your answer is saved for this machine only, in `sharing.json` in the `feedback` state directory
([below](#the-install-identity)) — not in the settings file, which roams with your profile: a yes
given on one machine never starts uploads from another. The question does not come back.

It is never asked when nobody is there to answer: without a terminal on both ends, in a scheduled
run, in CI (`CI` set), with `--json` or `--yes`, when `GUP_SHARE_LOGS` turns sharing off, or when
the machine gives gup no state directory (the answer could not be kept). Until you answer,
nothing is shared.

### What is sent, and when

Once you said yes, gup uploads what its journals gained since the last upload, after the app
closes, after `gup update`, `gup list` and `gup schedule run-now`, and after a scheduled run:

- the [activity history](journal-and-reports.md) records,
- the [debug log](journal-and-reports.md) records,

both redacted again exactly as `gup log export` and `gup report --format json` redact them. The
settings file, environment variables and anything else on the machine are never read for it. Of
the system a debug log's `session.start` record describes, only gup's version, Node's, the
platform and the architecture are sent: the environment variables and OS release the local log
holds stay on the machine. The records sharing writes about itself (`sharing.*`) are not sent.
Every batch also carries gup's version, the platform, the CPU architecture, Node's version and the
interface language.

The first upload after your first yes reaches back 30 days at most; when nothing is new, nothing
is sent. The upload never delays gup for long: a few seconds and five batches at most, after
which what is left waits for the next run, and it stops before its next batch when sharing is
turned off meanwhile. A batch the service rejects as malformed or too large is dropped; one that
could not be delivered (no network, the service busy or down) is sent again next time. The upload
never prints anything and never fails a command; what it did is in the debug log
(`sharing.upload`, `sharing.upload-dropped`, `sharing.upload-failed`). The service keeps shared
journals for 90 days.

### Changing your mind

```bash
gup feedback share off   # stop sharing, and erase what was shared
gup feedback share on    # share from now on
gup feedback status      # where sharing stands
```

```text
Sharing: on
Install ID: 3f2c8a4e-1b6d-4e2f-9a7c-5d8e0f1a2b3c
Last upload: 2026-11-20T08:01:13.002Z
```

`share off` saves the refusal, then asks the service to erase everything this install shared. If
the service cannot be reached, sharing is still off and the command says so: run it again later
to erase. Turning sharing back on after turning it off shares only what is written from then on:
the 30-day reach applies to your very first yes only.

Options › **Share journals** is the same switch, with the install ID beside it once it exists.
Turning it off there erases in the background; when you leave the app, gup waits a few seconds
at most for the erasure to finish.

`GUP_SHARE_LOGS=0` (or `off`, `false`, `no`) turns sharing off for every run of the shell it is
set in — a CI job, a managed machine — without touching the saved answer, and without ever asking.

## The install identity

The install ID is derived from an Ed25519 key pair gup generates for this install. The private
key, kept in `identity.json`, signs every upload and erasure request: it never leaves the machine,
and nobody who only knows your install ID can upload or erase in its name. It lives in the
machine-local `feedback` state directory — never in the settings file, which roams with your
profile and gets shared:

| OS | Directory |
|---|---|
| Windows | `%LOCALAPPDATA%\gup\feedback` |
| macOS | `~/Library/Application Support/gup/feedback` |
| Linux | `$XDG_STATE_HOME/gup/feedback` (else `~/.local/state/gup/feedback`) |

`GUP_FEEDBACK_DIR` moves it. The file is private to your account; the private key is never
printed nor logged. Next to it, `sharing.json` keeps your answer and `upload-cursor.json` records
how far the uploads went. `gup doctor` shows whether sharing is on and the install ID, or that it
is not created yet.

## For contributors

`GUP_FEEDBACK_API` and `GUP_FEEDBACK_FORM` point gup at another service or form, for local
development. They must be `https:`, or `http:` on this machine (`127.0.0.1`, `localhost`). Any
other value turns off what it addresses for the run — uploads and erasure, or the form — and never
falls back to the real service; it is logged (`sharing.override-rejected`) and every
`gup feedback` command says so on stderr. The service's contract:
[feedback-service.md](../development/feedback-service.md).
