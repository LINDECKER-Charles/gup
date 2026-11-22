# Feedback service

`gup` collects two kinds of input from its users, both optional:

- **Feedback** — a bug report or a suggestion, written in a form on the landing site
  (GitHub Pages). Anyone can send one; nothing ties it to a machine unless the user
  pastes their install ID.
- **Shared journals** — the history and the debug log of an install, uploaded by the CLI
  **only after the user said yes** to sharing them. They let the maintainer read what
  happened on a machine whose owner reported a bug.

Both land in the **feedback service** (`feedback/`), a small Node service hosted on the
maintainer's VPS, which stores them in PostgreSQL, relays every new feedback by mail, and
serves the **back office** where the maintainer triages them.

```
 landing (GitHub Pages)          gup CLI (user machine)
   │ POST /api/feedback             │ POST /api/installs/{id}/logs   (consent only)
   │ (fetch, or plain form post)    │ DELETE /api/installs/{id}      (consent withdrawn)
   ▼                                ▼
 ┌───────────────────── feedback service (VPS) ─────────────────────┐
 │  Fastify ── PostgreSQL ── mail outbox ──► SMTP ──► maintainer     │
 │  /admin  back office (server-rendered, no client script)         │
 │  /mcp    MCP endpoint for the maintainer's Claude Code (access)  │
 └──────────────────────────────────────────────────────────────────┘
```

This document is the contract between the three parts. A change to a route, a field or a
limit changes here first.

## Origins

| What | Production | Local development |
|---|---|---|
| Service (API + back office) | `https://feedback.global-updater.com` | `http://127.0.0.1:8787` |
| Landing (form) | `https://lindecker-charles.github.io/gup/` | `http://127.0.0.1:5173/gup/` (Vite) |
| Mail catcher | the real SMTP relay | Mailpit, `http://127.0.0.1:8025` |

The service origin is one constant on each side, overridable:

- CLI: `GUP_FEEDBACK_API` (service origin), `GUP_FEEDBACK_FORM` (form URL).
- Landing: `VITE_FEEDBACK_API` at build time; the production Content-Security-Policy adds
  that origin to `connect-src` and `form-action`.
- Service: `FEEDBACK_ALLOWED_ORIGINS` lists the origins allowed to post feedback (CORS and
  the form redirect).

## The install identity

Each install of the CLI owns an **Ed25519 key pair**, created on first need and kept in
the machine-local state directory (never in `config.json`, which roams and gets shared).
Its public ID derives from the public key:

| Value | Shape | Who sees it |
|---|---|---|
| private key | Ed25519, PKCS#8 DER, base64url, in `identity.json` (mode 0600) | nobody: it never leaves the machine |
| public key | the raw 32 bytes, base64url, no padding (43 chars) | the service, in every signed request |
| `installId` | UUID v4 shape, lower case, derived from the public key (below) | public: shown by `gup feedback`, pasted into a bug report, shown in the back office |

```
digest     = sha256(rawPublicKey)[0..16]
digest[6]  = (digest[6] & 0x0f) | 0x40      // version 4
digest[8]  = (digest[8] & 0x3f) | 0x80      // RFC 4122 variant
installId  = hex(digest) as 8-4-4-4-12
```

The ID is **self-certifying**: the service accepts a request for `{installId}` only when it
is signed by a key whose derived ID is `{installId}`. Nothing is bound on first use and no
secret is stored or sent, so a published ID cannot be claimed by someone else, and a
request captured by another origin (a mistyped `GUP_FEEDBACK_API`) cannot be replayed to
the real service, because the signature covers the service's origin.

### Request signature

Every `/api/installs/{installId}` request carries:

```
Authorization: GupInstall <publicKey>.<ts>.<signature>
```

- `publicKey`: the raw public key, base64url (43 chars).
- `ts`: the signing time, epoch milliseconds, decimal.
- `signature`: Ed25519 over the UTF-8 bytes of the string below, base64url (86 chars).

```
gup-install-v1\n<METHOD>\n<origin><pathname>\n<ts>\n<base64url(sha256(rawBody))>
```

`<origin>` is the service origin the CLI targets (`https://feedback.global-updater.com`, no
trailing slash) and the service compares it with its own `FEEDBACK_PUBLIC_URL` origin;
`<pathname>` is the request path without query; `rawBody` is the exact bytes sent (empty for
`DELETE`). The service answers `401 unauthorized` when the header is malformed, the derived
ID differs from the path, `ts` is more than 24 hours away from its clock (machines with a
wrong clock still get through; a replay can only repeat an idempotent request to the same
service), or the signature does not verify.

## Public API

Every response is JSON (`application/json; charset=utf-8`) unless stated. Errors share one
shape: `{ "error": "<code>", "message": "<English text>" }`, codes below per route.

### `POST /api/feedback`

Accepts `application/json` (the landing's script) **or**
`application/x-www-form-urlencoded` (the same form without JavaScript).

| Field | Required | Rule |
|---|---|---|
| `kind` | yes | `bug` or `suggestion` |
| `title` | yes | 3–120 characters after trimming |
| `message` | yes | 10–5000 characters after trimming |
| `email` | no | ≤ 254 characters, a plausible address; empty string = absent |
| `installId` | no | UUID v4 (case-insensitive, stored lower case); empty string = absent |
| `gupVersion` | no | ≤ 32 characters, `^[0-9A-Za-z.+-]+$` |
| `platform` | no | `win32`, `darwin`, `linux` or `other` |
| `locale` | no | ≤ 10 characters, `^[a-z]{2}(-[A-Za-z]{2})?$` |
| `website` | — | honeypot: must be absent or empty |
| `startedAt` | no | epoch milliseconds when the form was rendered |
| `returnTo` | form only | the landing URL to send the browser back to |

Anti-abuse: a non-empty honeypot or a `startedAt` less than 3 s old is **accepted silently
and dropped** (the bot gets a success, nothing is stored). Rate limit: 5 posts per 10
minutes per client address. Body ≤ 64 KiB (a 5000-character message in a non-Latin script,
form-encoded, takes up to 45 KiB). Text fields refuse control characters other than tab
and line breaks. The client address is used for the rate limit only and never stored.

Responses:

- JSON: `201 { "id": 42 }`; `400 { "error": "invalid", "fields": ["title", …] }`;
  `429 { "error": "rate_limited" }`.
- Form: `303` to `returnTo` (only when its origin is in `FEEDBACK_ALLOWED_ORIGINS`, the
  landing otherwise) with `feedback=sent`, `feedback=invalid` or `feedback=limited` added
  to the query and `#feedback` as fragment.

CORS: preflight and response headers for the allowed origins only, `POST` with
`Content-Type`, no credentials.

### `POST /api/installs/{installId}/logs`

Signed (see [Request signature](#request-signature)), `Content-Type: application/json`,
body ≤ 1 MiB. The install row is created by its first non-empty batch.

```json
{
  "schema": 1,
  "client": { "gupVersion": "0.6.0", "platform": "win32", "arch": "x64",
              "node": "26.10.0", "locale": "fr" },
  "history": [ { "v": 1, "ts": "2026-11-20T08:00:00.000Z", "runId": "…", "kind": "update", … } ],
  "logs":    [ { "v": 1, "ts": "2026-11-20T08:00:01.250Z", "level": "warn",
                 "event": "update.failed", "runId": "…", "pid": 4242, … } ]
}
```

- `history` items are history records as the CLI writes them on disk
  (`src/core/history/types.ts`), `logs` items are debug-log records
  (`src/core/log/types.ts`), **both redacted by the CLI before sending** (the same rules
  as `gup log export`). The service checks the envelope (`v` integer, `ts` ISO-8601,
  `runId` ≤ 64 characters, `kind` `scan|update` for history, `level` and `event` shape for
  logs) and stores each item as JSON; any item over 16 KiB serialised is refused.
- At most **1000 items** per batch (`history` + `logs`): the CLI splits a backlog into
  several batches. `client` fields follow the feedback rules above (`arch` and `node`
  ≤ 32 characters).
- Items are deduplicated per install on a hash of their canonical JSON: resending a batch
  after a timeout stores nothing twice.
- Strings and keys must be well-formed Unicode without NUL (`\u0000`): PostgreSQL `jsonb`
  refuses both. The CLI normalises them before sending; the service answers `400` when one
  gets through.
- Rate limits: 60 batches per hour per install, 120 requests per hour per client address
  (IPv6 grouped by /64) across both install routes, and 10 new installs per hour per
  client address.

Responses: `202 { "accepted": { "history": 12, "logs": 340 } }` (newly stored counts);
`400 invalid`; `401 unauthorized` (bad signature); `413 too_large`; `429 rate_limited`.
The CLI drops a batch answered `400` or `413` (it would fail again) and retries the others
on its next upload. It syncs about once a week, and at once when the user opens the feedback
form; a sync cut short carries on at the next command that writes the journals. A first sync
sends the install's whole local history, at most 5 batches per run, well under the 60
uploads per hour an install may make.

A literal example lives in [`feedback/contract/log-batch.v1.example.json`](../../feedback/contract/log-batch.v1.example.json):
the service's tests post it and the CLI's tests compare their batch shape to it.

### `DELETE /api/installs/{installId}`

Signed, empty body. Erases the install and everything uploaded for it (consent withdrawn).
`204` on success **and** when the install is unknown (idempotent); `401` when the signature
does not verify.

### `GET /healthz`

`200 { "status": "ok" }` when the database answers, `503` otherwise. Used by the container
healthcheck and the deployment probe.

## Back office

Server-rendered HTML under `/admin`, in French (its only reader is the maintainer), no
client-side script, strict CSP (`default-src 'none'`; styles and fonts from `'self'`).

| Page | What it does |
|---|---|
| `GET /admin/login` · `POST /admin/login` | single admin account (`ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH`) |
| `GET /admin/login/code` · `POST /admin/login/code` | second step: the TOTP code of the app enrolled with `ADMIN_TOTP_SECRET` |
| `POST /admin/logout` | ends the session |
| `GET /admin` | inbox: search (`q`), status pills with counts (`status`, `all` for every status; opens on `new`), kind pills (`kind`), newest first, paginated |
| `GET /admin/feedback/{id}` | one feedback: message and reply by mail, context (address, install ID with a link to its journals when shared, version, platform, language); status in one click, private note, delete |
| `GET /admin/installs` | installs that shared journals: last upload, version, platform, counts |
| `GET /admin/installs/{id}` | one install: every column, counts, the period its journals cover and when retention next purges them; its feedback; the whole history (`kind`, `status`, `hpage`); the debug log (`level`, `q`, `lpage`); erase |
| `GET /admin/installs/{id}/runs/{runId}` | one run: its span and counts, then every history item and log line it wrote, merged oldest first (`page`, 200 a page) |
| `GET /admin/installs/{id}/export` | everything stored for the install as JSON Lines, downloaded (`gup-install-{id}.jsonl`) |
| `GET /admin/mails` | the mail relay as configured (never its user or password), outbox counts, every unsent mail with its attempts and last error |
| `POST /admin/mails/test` · `POST /admin/mails/retry` | send a test mail to the address typed in (the notification recipient by default); make every unsent mail due now |
| `POST /admin/mails/recipient` · `POST /admin/mails/recipient/reset` | change the address notifications go to; go back to `FEEDBACK_NOTIFY_TO` |
| `GET /admin/mcp` · `POST /admin/mcp` | the MCP accesses, active then expired or revoked, and the form that issues one (`422` with the refused fields) |
| `GET /admin/mcp/token` | the token of the access the session just issued, once: in memory for 10 minutes, then gone and its access revoked |
| `POST /admin/mcp/{id}/revoke` | revoke an active access, confirmed by a ticked box |
| `GET /admin/assets/{name}` | stylesheet, fonts, logo and favicons; no session needed (the login page uses them) |

**Search.** `q` is trimmed, its spaces collapsed, cut to 100 characters. It matches,
ignoring case, a part of the title, the message, the reporter's address or the install ID —
`%` and `_` taken literally — or the feedback's number (`42` or `#42`). The status counts
follow the search and the kind, so the pills say what each status would list. The query
scans the table (`ILIKE`), which an inbox of a few thousand rows answers at once; a
`pg_trgm` index is the step after.

**Install journals.** The install page reads everything the service holds for it. The
history lists scans and updates together, newest first, 50 a page, filtered by kind
(`kind=scan|update`) and update status (`status=success|failed|skipped`); each pill counts
what it would list under the other filter. The debug log shows `warn` and above by default
(`level`), 50 lines a page, and searches (`q`, same trimming and 100-character cut as the
inbox) the event name and every key and value of the record, ignoring case, `%`, `_` and
`\` taken literally — a value the JSON text escapes, such as a Windows path, is found as
typed. History and log keep their own filters and page in the URL, so moving through one
never resets the other, and every link lands on its section. Each history item and log
line folds its whole record as received, pretty-printed and escaped, and links to its run.
A run's page merges the history items and log lines of one `runId`, oldest first (at the
same instant a log line comes before the history item it led to). The search scans the
install's log lines (`ILIKE` on the event, the JSON text and a `jsonb_path_query` walk of
its scalars): a few thousand lines per install, bounded by retention, answer in tens of
milliseconds.

**Export.** `GET /admin/installs/{id}/export` answers `application/x-ndjson`, one JSON
object per line, each with a `type`: `export` (format `gup-install-export`, `version` 1,
`exportedAt`, `retentionDays`), `install`, then every `feedback`, every `history` item and
every `log` line, oldest first. The journals are read in keyset chunks of 1000 as the
response drains, so an install of any size streams in flat memory. Admin-only and
`no-store`, like every back-office response.

**Mails.** The page shows the relay as read from `SMTP_URL` — host, port (nodemailer's
default when the URL names none: 465 for `smtps://`, 587 otherwise), implicit TLS or
STARTTLS — the sender, the recipient, the outbox's poll interval and attempt cap; or says
it is not configured and that mails wait in the outbox. Counts: waiting (never tried),
failing (tried, not sent, given-up mails included), sent in the last 30 days; then every
unsent mail, oldest first, with its feedback, attempts, next attempt and the start of its
last error. *Destinataire des retours* changes the address notifications go to; it is
stored in the database (`mail_setting`, one row) and read by the worker at each batch,
so mails already queued go there too. Typing `FEEDBACK_NOTIFY_TO` back, or *Revenir à…*,
deletes the row: the configured address applies again. *Envoyer un mail de test* sends a
plain mail to the address typed in (the notification recipient when left empty) through
the same relay as notifications, at most 5 per 10 minutes per address, and reports the
relay's answer — refused with a notice when SMTP is not configured; the last result lives
in the process's memory. Both address fields take one address only: no display name, no
list, no space or line break (254 characters at most). *Relancer maintenant* makes every
unsent mail due at once, and gives a given-up mail one more attempt. All are CSRF-checked
forms answered by a redirect and a notice.

**Design.** The back office takes the landing's design (`index/`): its oklch tokens (dark
only), Anton for page names, Geist for text, Geist Mono for labels and controls, the violet
accent, amber for what is new, the bloom-and-grid backdrop, the glass top bar with the logo.
The fonts, the logo and the favicons are copies of `index/static/` files in
`feedback/assets/`; the stylesheet is split by layer in `assets/styles/` (tokens, base,
frame, controls, lists, detail, tables) and served joined as `app.css`. Every asset URL
carries a content hash (`?v=`) and is cached as immutable; the table of served files is
fixed in `src/views/admin-assets.ts`, so no request reads a path it names.

| Screen | Choices |
|---|---|
| Inbox | Search with a visible label and a persistent hint; one pill group per filter (one value each, `aria-current`), a swipeable row below 720 px so the list starts in the first screen; new feedback counted and edged in amber; the card's title is its link and the whole card its target; three empty states (nothing yet, nothing new, nothing matches — with a way out) |
| Feedback | Reading on the left, acting on the right (sticky from 1024 px); "Répondre par mail" is the page's only primary button; the status is four submit buttons (`aria-pressed`), one click each; the note says it never reaches the reporter; deletion folded under a danger zone and refused until its box is ticked |
| Installs, install | Tables that stack into labelled cards below 720 px; jump pills with counts to each section of the install page; the facts panel ends on the export; history in one table with two pill groups, failures in red under the subject; the debug log as a list of lines, errors tinted, its search above the level pills; a record's data folded under "Données complètes" and scrolling in its own box; erasing folded like deletion |
| Run | The run's facts, then one list where history items sit among log lines, tinted violet (red when failed), with their status where a line has its level |
| Mails | Outbox on the left (counters, waiting and failing ones highlighted, then the unsent mails), relay on the right with its two actions; a refused test shows the relay's error in full, escaped |

Checked at 390 × 844 and 1440 × 900 with the CSP enforced: no horizontal overflow, no
blocked resource, axe (WCAG 2.2 AA and best practices) without violation on every page,
every action reachable by keyboard behind a skip link, a visible focus ring everywhere.

Statuses: `new` → `in_progress` → `resolved` or `dismissed` (any transition allowed).

Security: session token (32 random bytes) in an `HttpOnly; Secure; SameSite=Strict`
cookie (`__Host-gup_admin`), stored hashed with an absolute 7-day and an idle 12-hour
expiry; a per-session CSRF token in every form; mutating routes also check `Origin`
(`null` counts as foreign) — hence `Referrer-Policy: same-origin`, since `no-referrer`
makes browsers send `Origin: null` on the back office's own forms; login rate-limited (10
per 15 minutes per address for each step, 100 per hour in all) and answered in constant
time whatever the user name.

Second factor (required with `FEEDBACK_ENV=production`): the right password opens a
session that reaches nothing but the code form, for 5 minutes. The code is TOTP (RFC
6238: HMAC-SHA-1, 6 digits, 30-second steps, one step either side), compared in
constant time; the right one replaces that session with a full one (a new token), and
the step it belongs to is recorded so the same code, or an older one, never opens
another. A half-open session has 5 code attempts, each taken in one statement before the
code is checked (parallel posts get no more); the fifth wrong one drops it and the
password is asked again. Every wrong password and wrong code is logged as a warning. Each
session records how far it got (`due`, `passed`, or `skipped` when no key is configured):
with a key, only `passed` opens the back office, so sessions opened with the password
alone before the key was set are refused. *Recommencer avec le mot de passe* on the code
form is a logout: the half-open session goes at once. Every response carries `X-Content-Type-Options: nosniff`, and
`Strict-Transport-Security` when `FEEDBACK_PUBLIC_URL` is `https:`.

## MCP access

`POST /mcp` serves the [Model Context Protocol](https://modelcontextprotocol.io) so the
maintainer's Claude Code can analyse feedback and shared journals straight from
production, through accesses the back office issues (tab *04 MCP*). Registration on the
maintainer's machine: [`feedback/README.md`](../../feedback/README.md#connect-claude-code).

**Accesses.** Each has a name, permissions, an expiry and a token. Permissions:
`feedback:read` (search and read feedback, reporters' addresses included),
`feedback:triage` (change a feedback's status and note; brings `feedback:read`, since the
tool answers with the feedback it changed), `journals:read` (installs and their journals).
Lifetimes: 1, 7, 30, 90 or 365 days, 30 by default; none is unlimited. The token is
`gupmcp_` and 43 base64url characters (256 random bits); it is shown once, on the page that
follows the issue, and the service keeps its SHA-256 and its last four characters only. A
token nobody saw opens nothing, so its access is revoked: when a second issue from the same
session replaces it before it is shown, when its 10 minutes run out, or when the service
stops. A revoked access cannot be restored: issue another. The table refuses
`feedback:triage` without `feedback:read`, and the check of a token applies that rule again. Expired and revoked accesses stay listed
90 days, then the daily purge deletes them.

**Transport.** Streamable HTTP, stateless (no `Mcp-Session-Id`, a fresh server instance
per request), answers in plain JSON (no SSE for tool calls). Both protocol eras: the
2025-era `initialize` handshake and the 2026-07-28 per-request envelope. `GET` and `DELETE`
answer `405` (`Allow: POST`); bodies must be `application/json`, at most 1 MiB. Built on
the official SDK (`@modelcontextprotocol/server` v2, tool schemas in zod).

**Authentication.** `Authorization: Bearer <token>`. The presented token's SHA-256 is
looked up among the active accesses (not revoked, not expired) in one statement that also
records the access's last use; a token of the wrong shape is refused before any lookup.
Missing, malformed, unknown, expired or revoked token: `401 unauthorized` with
`WWW-Authenticate: Bearer` — with no access issued, every request gets it. A request carrying an `Origin` header
is refused with `403` whatever its token — browsers send it, MCP clients do not, so no web
page can drive the endpoint (DNS rebinding, CSRF). The token and the `Authorization` header
never reach the logs (pino redaction; the header is not passed to the SDK).

**Limits**, in memory per process, per client address: 600 calls per hour; 20 failed
authentications per 15 minutes, after which even the right token gets `429` until the
window ends. Responses carry `Cache-Control: no-store` and `nosniff`.

**Tools.** An access lists and serves only the tools of its permissions — `search_feedback`
and `get_feedback` for `feedback:read`, `update_feedback` for `feedback:triage`, the five
others for `journals:read` — and the server's instructions name what it may do. Tools
whose answer straddles permissions leave out what the access does not cover: `get_feedback`
returns `install: null` without `journals:read`; without `feedback:read`, `get_install`
returns `feedback: null`, and it and `list_installs` give each install a `feedbackCount` of
`null`. Inputs are strict JSON schemas (unknown keys, out-of-range pages, malformed IDs
refused); results are structured JSON plus a compact text rendering; dates are ISO 8601
UTC; lists are newest first and paginated (`page` from 1). An unknown ID or an invalid
input is a tool error (`isError`), never an HTTP error.

| Tool | Input | Returns |
|---|---|---|
| `search_feedback` | `query?` (≤ 100, the inbox's search), `status?`, `kind?`, `page?`, `pageSize?` (20, ≤ 100) | items (message cut to a 280-character preview), total, counts per status under the same query and kind; every status when `status` is omitted |
| `get_feedback` | `id` | the whole feedback, note and address included, and the summary of its install when that install shared journals |
| `update_feedback` | `id`, `status?`, `note?` (≤ 5000, plain text, trimmed; `""` clears) | the updated feedback; at least one of `status` and `note` |
| `list_installs` | `page?`, `pageSize?` (20, ≤ 100) | installs that shared journals, most recent upload first |
| `get_install` | `installId` | summary, history counts per kind and status, the span and run count of its records, its feedback |
| `list_history` | `installId`, `kind?`, `status?`, `page?`, `pageSize?` (50, ≤ 500) | history items with their full `data` |
| `list_logs` | `installId`, `maxLevel?` (`trace` by default), `query?` (≤ 100: the event name, any key or value), `page?`, `pageSize?` (100, ≤ 500) | log lines with level, event and full `data` |
| `get_run` | `installId`, `runId`, `page?`, `pageSize?` (200, ≤ 500) | the run's span and counts, then its history items and log lines merged, oldest first |

What it cannot do: delete a feedback, erase an install, send mail, issue an access, or
reach anything but these ports — the only write is a feedback's status and note, with the
back office's rules. Whoever holds a token gets what its permissions give until it expires
or is revoked: with `feedback:read`, every reporter's address.

## Mail relay

Each new feedback queues a mail in an outbox table, in the same transaction as the
feedback: a mail server that is down delays the mail, never loses the feedback. A worker
sends pending mails with an exponential backoff (up to 8 attempts) to `FEEDBACK_NOTIFY_TO`,
or to the address the back office set in its place, with `Reply-To` set to the reporter when they left an address — answering the mail answers
the reporter. Without SMTP settings the service runs and the outbox waits.

## Retention

Uploaded journal items older than `LOG_RETENTION_DAYS` (default 90) are purged daily; an
install with nothing left and no upload within that window is deleted. An MCP access is
deleted 90 days after it expired or was revoked. Feedback is kept until the maintainer
deletes it.

## Running it

Local development, deployment and configuration: [`feedback/README.md`](../../feedback/README.md).
