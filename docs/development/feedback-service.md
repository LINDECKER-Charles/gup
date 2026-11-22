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
 └──────────────────────────────────────────────────────────────────┘
```

This document is the contract between the three parts. A change to a route, a field or a
limit changes here first.

## Origins

| What | Production | Local development |
|---|---|---|
| Service (API + back office) | `https://gup.charles-lindecker.com` | `http://127.0.0.1:8787` |
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

`<origin>` is the service origin the CLI targets (`https://gup.charles-lindecker.com`, no
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
on its next run.

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
| `POST /admin/logout` | ends the session |
| `GET /admin` | inbox: search (`q`), status pills with counts (`status`, `all` for every status; opens on `new`), kind pills (`kind`), newest first, paginated |
| `GET /admin/feedback/{id}` | one feedback: message and reply by mail, context (address, install ID with a link to its journals when shared, version, platform, language); status in one click, private note, delete |
| `GET /admin/installs` | installs that shared journals: last upload, version, platform, counts |
| `GET /admin/installs/{id}` | one install: its feedback, failed updates, recent scans, debug-log records (minimum-level pills), erase |
| `GET /admin/assets/{name}` | stylesheet, fonts, logo and favicons; no session needed (the login page uses them) |

**Search.** `q` is trimmed, its spaces collapsed, cut to 100 characters. It matches,
ignoring case, a part of the title, the message, the reporter's address or the install ID —
`%` and `_` taken literally — or the feedback's number (`42` or `#42`). The status counts
follow the search and the kind, so the pills say what each status would list. The query
scans the table (`ILIKE`), which an inbox of a few thousand rows answers at once; a
`pg_trgm` index is the step after.

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
| Installs, install | Tables that stack into labelled cards below 720 px; jump pills with counts to each section of the install page; the debug log as a list of lines, errors tinted; erasing folded like deletion |

Checked at 390 × 844 and 1440 × 900 with the CSP enforced: no horizontal overflow, no
blocked resource, axe (WCAG 2.2 AA and best practices) without violation on every page,
every action reachable by keyboard behind a skip link, a visible focus ring everywhere.

Statuses: `new` → `in_progress` → `resolved` or `dismissed` (any transition allowed).

Security: session token (32 random bytes) in an `HttpOnly; Secure; SameSite=Strict`
cookie (`__Host-gup_admin`), stored hashed with an absolute 7-day and an idle 12-hour
expiry; a per-session CSRF token in every form; mutating routes also check `Origin`
(`null` counts as foreign) — hence `Referrer-Policy: same-origin`, since `no-referrer`
makes browsers send `Origin: null` on the back office's own forms; login rate-limited (10
per 15 minutes per address, 100 per hour in all) and answered in constant time whatever
the user name. Every response carries `X-Content-Type-Options: nosniff`, and
`Strict-Transport-Security` when `FEEDBACK_PUBLIC_URL` is `https:`.

## Mail relay

Each new feedback queues a mail in an outbox table, in the same transaction as the
feedback: a mail server that is down delays the mail, never loses the feedback. A worker
sends pending mails with an exponential backoff (up to 8 attempts) to `FEEDBACK_NOTIFY_TO`,
with `Reply-To` set to the reporter when they left an address — answering the mail answers
the reporter. Without SMTP settings the service runs and the outbox waits.

## Retention

Uploaded journal items older than `LOG_RETENTION_DAYS` (default 90) are purged daily; an
install with nothing left and no upload within that window is deleted. Feedback is kept
until the maintainer deletes it.

## Running it

Local development, deployment and configuration: [`feedback/README.md`](../../feedback/README.md).
