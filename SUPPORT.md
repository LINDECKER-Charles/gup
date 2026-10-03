# Support

`gup` is maintained by one person in their spare time. This page explains where
to ask for help and what to include so a question gets an answer quickly.

## Before asking

1. Run `gup doctor`. It lists the providers detected on your machine, the ones
   that are not installed, and how to install them. Many "gup does not see X"
   questions end here.
2. Check the documentation:
   - [Installation](docs/guide/installation.md): requirements (Node ≥ 26.9),
     install methods, per-platform support.
   - [CLI reference](docs/guide/cli-reference.md): every command and flag,
     targeting syntax, stuck-install timeouts, retries, elevation, exit codes.
   - [Scope](docs/guide/scope.md): what `gup` covers and what it deliberately
     leaves out.
   - [Providers catalog](docs/guide/providers-catalog.md): every supported
     source, and the candidates already evaluated or turned down.
3. Search the [existing issues](https://github.com/LINDECKER-Charles/gup/issues?q=is%3Aissue),
   open and closed.

## Where to ask

| You want to… | Go to |
|---|---|
| Report something that does not work as documented | The [*Bug report*](https://github.com/LINDECKER-Charles/gup/issues/new?template=bug_report.yml) form |
| Ask `gup` to support another package source | The [*New provider*](https://github.com/LINDECKER-Charles/gup/issues/new?template=provider_request.yml) form |
| Propose a change to how `gup` behaves | The [*Feature request*](https://github.com/LINDECKER-Charles/gup/issues/new?template=feature_request.yml) form |
| Ask how to do something with `gup` | The [*Question*](https://github.com/LINDECKER-Charles/gup/issues/new?template=question.yml) form |
| Report a security vulnerability | A [private security advisory](https://github.com/LINDECKER-Charles/gup/security/advisories/new) — **never a public issue**. See [SECURITY.md](SECURITY.md). |

Blank issues are disabled: the forms ask for exactly what is needed to
reproduce a problem on someone else's machine.

## What to include

- `gup --version` and `node --version`.
- Operating system and version (`Windows 11 24H2`, `macOS 15.6`, `Ubuntu 24.04`…).
- The terminal you run `gup` in: Windows Terminal, the Windows console host
  (conhost), the VS Code terminal, iTerm2, Terminal.app, GNOME Terminal…
  The interactive app is a full-screen terminal program, and terminals differ.
- The output of `gup doctor`.
- The exact command you ran and its full output. For an update, capture it
  with `gup update -y <provider>:<package> 2>&1 | tee gup.log`: `-y` skips
  the retry prompt, which needs a terminal and cannot open once the output
  goes to a pipe.
- If your version of `gup` has the `gup log` command, the debug log
  (`gup log -n 50`) or the diagnostic archive from `gup log export`.

Outputs can contain your username, home directory and the list of software
installed on your machine. **Read them and redact what you do not want to
publish** before pasting or attaching them.

## What to expect

- Best effort, no SLA and no paid support. An answer can take a few days,
  sometimes longer.
- English is preferred so that everyone can follow the thread; French is
  welcome. The interface itself is in French.
- An issue that cannot be reproduced and gets no reply to a follow-up question
  may be closed. It can be reopened at any time with the missing details.
- A request outside the [scope](docs/guide/scope.md) is closed with a link to
  the reasoning, not ignored.

## Helping the project

- Star the repository, or support it on
  [Ko-fi](https://ko-fi.com/charleslindecker) or
  [GitHub Sponsors](https://github.com/sponsors/LINDECKER-Charles).
- Answer an open question, or confirm a bug on a platform the maintainer does
  not use daily.
- Pick an issue labelled
  [`good first issue`](https://github.com/LINDECKER-Charles/gup/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22),
  or add a provider: [CONTRIBUTING.md](CONTRIBUTING.md) walks through it.

How the project is run, and who decides what: [GOVERNANCE.md](GOVERNANCE.md).
