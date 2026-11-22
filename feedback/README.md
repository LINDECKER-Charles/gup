# gup feedback service

The server side of gup's two optional inputs: **feedback** posted from the landing site,
and **shared journals** uploaded by the CLI once its user consented. It stores both in
PostgreSQL, relays each new feedback by mail, and serves the French back office where
the maintainer triages them.

The routes, fields, limits and behaviour are specified in the contract,
[`docs/development/feedback-service.md`](../docs/development/feedback-service.md). This
file covers running, configuring and deploying the service.

- Node 26, TypeScript (strict ESM), [Fastify 5](https://fastify.dev/), `pg` (no ORM),
  nodemailer.
- Server-rendered HTML, no client script, strict CSP.
- One process: HTTP API, back office, mail outbox worker and daily retention purge.
  Migrations (`migrations/NNN_name.sql`) run at start under an advisory lock.

### Security at a glance

The contract is the reference; in short:

- **Installs** hold an Ed25519 key pair. Their ID is derived from the public key, and
  every upload or erasure carries `Authorization: GupInstall <pub>.<ts>.<sig>` over the
  method, the full URL, the timestamp (±24 h) and the body's SHA-256. No shared secret is
  stored; an install row is created by its first non-empty batch.
- **Rate limits**, in memory per process: 120 requests per hour per address across the
  install routes (IPv6 grouped by /64), 60 uploads per hour per install, 10 new installs
  per hour per address; 5 feedbacks per 10 minutes per address; 10 password and 10 code
  attempts per 15 minutes per address, and 100 per hour overall, both steps counted.
- **Back-office login**: the password, then a TOTP code (required in production). A code
  works once; a password-checked session gets 5 code attempts, reserved before each check,
  then the password is asked again. Wrong passwords and codes are logged as warnings.
- **MCP** (`/mcp`, off unless configured): a bearer token checked against its SHA-256,
  no browser origin, 20 failed authentications per 15 minutes and 600 calls per hour per
  address; reads everything, writes only a feedback's status and note.
- **Input**: 64 KiB bodies for feedback and admin notes, 1 MiB per log batch; text
  fields refuse control characters (tabs and line breaks aside) and ill-formed Unicode.
- **Responses**: `nosniff` everywhere, HSTS when the public URL is https; the back office
  adds a strict CSP, `Referrer-Policy: same-origin` (its forms must keep their `Origin`),
  frame denial and `no-store`.

## Layout

| Path | What lives there |
|---|---|
| `src/main.ts` | composition root: config, pool, migrations, app, background tasks, shutdown |
| `src/app.ts` | `buildApp(deps)`: the HTTP application, built from ports only |
| `src/domain/` | contract vocabulary and validation (feedback, log batches) |
| `src/http/api/`, `src/http/admin/` | public API, back office (guard, routes, errors) |
| `src/ports/` | the interfaces the app is built on (`mail/`: mailer and outbox) |
| `src/views/` | escaping `html` template tag (`kit/`), French words and formats (`text/`), pages (`pages/inbox/`, `pages/install/`, `pages/mails/`), served assets |
| `src/auth/`, `src/security/` | admin credentials and sessions; hashing, tokens, origin checks |
| `src/identity/` | install IDs and the verification of their signed requests |
| `src/store/` | PostgreSQL adapters of the ports (`feedback/`, `install/` for the journal reader's SQL), migration runner |
| `src/mail/`, `src/jobs/` | outbox worker and mail; retention job and task scheduling |
| `src/mcp/` | the MCP endpoint for Claude Code: guard, transport bridge, tools (`tools/`) |
| `assets/` | the back office's stylesheet (`styles/`, one file per layer), fonts, logo and favicons, copied from the landing and served with a content hash |
| `migrations/` | SQL migrations, applied in name order |
| `contract/` | the upload example the tests post |
| `scripts/` | admin password hashing, demo data (`lib/demo-journal.ts`) |

## Run it locally

Prerequisites: Docker, and Node 26 for the scripts and tests.

The stack reads its secrets from `feedback/dev.env` (ignored by git). Maintainers get it
from the secrets vault. Without it, create your own:

```sh
cd feedback
npm ci
PASSWORD="$(openssl rand -base64 18)"        # your admin password: keep it
{
  echo "POSTGRES_PASSWORD=$(openssl rand -hex 24)"
  echo "ADMIN_PASSWORD_HASH=$(printf '%s' "$PASSWORD" | npm run -s admin:hash)"
  echo "ADMIN_TOTP_SECRET=$(npm run -s admin:totp -- secret)"
} > dev.env
echo "admin password: $PASSWORD"
grep '^ADMIN_TOTP_SECRET=' dev.env | cut -d= -f2- | npm run -s admin:totp -- qr totp-dev.svg
```

Scan `totp-dev.svg` with an authenticator app, then delete it. Leaving
`ADMIN_TOTP_SECRET` out of `dev.env` signs in with the password alone (development only).

Then start the service, Postgres and Mailpit:

```sh
docker compose --env-file dev.env -f compose.yaml -f compose.dev.yaml up -d --build
```

| URL | What |
|---|---|
| <http://127.0.0.1:8787/admin> | back office — user `admin`, the password above, then the app's code |
| <http://127.0.0.1:8787/api/feedback> | the API the landing posts to |
| <http://127.0.0.1:8025> | Mailpit: every notification mail lands here |
| `127.0.0.1:5439` | Postgres, user and database `gup_feedback` (`FEEDBACK_DEV_DB_PORT` in `dev.env` moves it) |

Open the back office on `127.0.0.1`, not `localhost`: admin forms are accepted only from
the exact origin of `FEEDBACK_PUBLIC_URL`. The landing's dev servers
(`http://127.0.0.1:5173`, `http://localhost:5173`, `http://127.0.0.1:5180`) are allowed to
post feedback.

Some placeholder data to look at (fictional feedback and two installs with six weeks of
runs each — history and log lines sharing run IDs, some updates failing with an error
logged; refused when `FEEDBACK_ENV` is `production`):

```sh
set -a; . ./dev.env; set +a
DATABASE_URL="postgres://gup_feedback:$POSTGRES_PASSWORD@127.0.0.1:5439/gup_feedback" \
  FEEDBACK_ENV=development npm run seed:demo -- --yes
```

Each demo feedback queues its notification like a real one: they show up in Mailpit.

Stop and wipe: `docker compose --env-file dev.env -f compose.yaml -f compose.dev.yaml down -v`.

Without Docker, `npm run dev` runs `src/main.ts` under `tsx watch` with the variables of
the table below in the environment.

## Tests

```sh
npm run typecheck
npm run lint
npm test                    # unit: the HTTP app on in-memory fakes
npm run test:integration    # PostgreSQL adapters, against a throwaway database
```

The integration suite is skipped unless `FEEDBACK_TEST_DATABASE_URL` is set, and it
**drops the `public` schema** of that database: point it at a disposable one only.

```sh
docker run -d --rm --name gup-feedback-test-pg -e POSTGRES_PASSWORD=test \
  -p 127.0.0.1:55432:5432 postgres:18-alpine
FEEDBACK_TEST_DATABASE_URL=postgres://postgres:test@127.0.0.1:55432/postgres \
  npm run test:integration
docker stop gup-feedback-test-pg
```

## Configuration

Environment variables, read once at start; any problem stops the service with the full
list.

| Variable | Default | Meaning |
|---|---|---|
| `DATABASE_URL` | required | PostgreSQL connection URL (compose builds it from `POSTGRES_PASSWORD`) |
| `FEEDBACK_PUBLIC_URL` | required | public URL of the service; its origin gates admin forms, signs install requests and builds mail links; https in production |
| `ADMIN_USERNAME` | required | the single back-office account |
| `ADMIN_PASSWORD_HASH` | required | `scrypt:N:r:p:salt:hash`, from `npm run -s admin:hash`; see the bounds below |
| `ADMIN_TOTP_SECRET` | required in production | base32 key of the authenticator app, 16 bytes at least, from `npm run -s admin:totp -- secret`; see below |
| `FEEDBACK_ENV` | `production` | `development` allows `COOKIE_SECURE=false` and the demo seed |
| `FEEDBACK_LANDING_URL` | `https://lindecker-charles.github.io/gup/` | where a no-JavaScript form returns when its `returnTo` is not allowed |
| `FEEDBACK_ALLOWED_ORIGINS` | the landing's origin | comma-separated origins allowed to post feedback (CORS, form return) |
| `SMTP_URL` | unset | `smtp://` or `smtps://` URL; unset, mails wait in the outbox |
| `MAIL_FROM`, `FEEDBACK_NOTIFY_TO` | required with `SMTP_URL` | sender and recipient of notifications; the back office's Mails page can send them elsewhere, and back |
| `LOG_RETENTION_DAYS` | `90` | journal items received longer ago are purged daily |
| `OUTBOX_POLL_INTERVAL_SECONDS` | `30` | how often the outbox is checked |
| `TRUST_PROXY` | `loopback,uniquelocal` | peers allowed to set `X-Forwarded-For` (the edge, on a private network): `true`, `false`, or a comma-separated list of `loopback`, `linklocal`, `uniquelocal`, IPs and CIDR ranges |
| `COOKIE_SECURE` | `true` | `false` for local http only: drops `Secure` and the `__Host-` prefix |
| `HOST`, `PORT` | `0.0.0.0`, `8080` | listen address |
| `LOG_LEVEL` | `info` | pino level; logs are JSON lines on stdout |
| `FEEDBACK_MCP_TOKEN_SHA256` | unset | SHA-256 (64 lowercase hex) of the bearer token of `/mcp`, the MCP endpoint for Claude Code; unset, the endpoint does not exist. See [Connect Claude Code](#connect-claude-code) |

The service never reads `ADMIN_PASSWORD`: the vault keeps the clear password for the human
only, and compose passes the container nothing but the variables it lists.

Compose interpolates `$` in env files. Generated values never contain one (the hash format
uses `:`, secrets are hex or base64url); a hand-written value that does, such as an SMTP
password, must write it `$$`.

### Admin password

```sh
printf '%s' 'the password' | npm run -s admin:hash
```

The password goes through stdin, never argv; the command prints the hash and nothing
else. A hash is accepted only with `N` a power of two in [2^14, 2^17], `r` in [8, 16],
`p` in [1, 4] and at most 64 MiB per derivation (`128·N·r`); the service derives it once
at start and refuses to run when the host cannot. Rotating it means replacing `ADMIN_PASSWORD_HASH` and restarting; open sessions
survive until they expire, so delete them (`DELETE FROM admin_session`) when the old
password leaked.

### Second factor

After the password, the back office asks for the 6-digit code of an authenticator app
(TOTP, RFC 6238: SHA-1, 30 seconds, the previous and next step accepted). The key is
`ADMIN_TOTP_SECRET`, held by the vault like the other secrets; nothing about it is
stored in the database but the last step a code was accepted for, so a code works once.

```sh
npm run -s admin:totp -- secret            # a new key, printed and nothing else
printf '%s' "$ADMIN_TOTP_SECRET" | npm run -s admin:totp -- qr totp.svg [account]
```

The second command writes the enrolment QR code without printing the key, never over an
existing file; the file is owner-only on Unix, and takes its folder's permissions on
Windows. Scan it, then delete the file. Apps that take a key by hand accept
`ADMIN_TOTP_SECRET` as it is. A lost phone means a new key: replace it, redeploy, scan
the new QR code. The service refuses to start in production without a key.

### Connect Claude Code

`POST /mcp` lets Claude Code read the feedback and the shared journals, and triage
feedback (status and note), with the tools the contract lists under
[MCP access](../docs/development/feedback-service.md#mcp-access). It answers only a bearer
token whose SHA-256 is `FEEDBACK_MCP_TOKEN_SHA256`: the server holds the digest, the
maintainer's machine holds the token.

1. Create the token and its digest, and keep the token in the secrets vault:

   ```sh
   TOKEN="$(openssl rand -hex 32)"
   printf '%s' "$TOKEN" | sha256sum | cut -d' ' -f1   # → FEEDBACK_MCP_TOKEN_SHA256
   ```

2. Put the digest in the production `.env` (the `FEEDBACK_ENV_FILE` secret) and deploy.
   Compose passes it to the container; the service refuses to start on a malformed one.
3. Expose the token to Claude Code as the environment variable `GUP_FEEDBACK_MCP_TOKEN`
   (a user-level variable, or exported by the shell profile from the vault), then register
   the server once, in **user** scope, with the variable written literally — single quotes,
   so the shell leaves `${…}` alone and Claude Code expands it at each connection:

   ```sh
   claude mcp add --transport http --scope user gup-feedback \
     https://feedback.global-updater.com/mcp \
     --header 'Authorization: Bearer ${GUP_FEEDBACK_MCP_TOKEN}'
   claude mcp get gup-feedback      # status: connected
   ```

   The same line works in PowerShell (one line, no `\`): single quotes keep `${…}` literal
   there too. The entry lands in `~/.claude.json` with the placeholder, never the token;
   check with `claude mcp get gup-feedback` that the header still reads
   `${GUP_FEEDBACK_MCP_TOKEN}`. Do not add it to a `.mcp.json` in this repository: it is
   public, and the token would be one typo away. If the variable is missing when Claude Code
   starts, it warns and sends the placeholder as is: the service answers `401`.

The local stack answers on its own `/mcp` with the token of `dev.env`. Register it beside the
production one, under another name and another variable, so both can stay registered:

```sh
claude mcp add --transport http --scope user gup-feedback-dev \
  http://127.0.0.1:8787/mcp \
  --header 'Authorization: Bearer ${GUP_FEEDBACK_DEV_MCP_TOKEN}'
```

Rotating: new token and digest, redeploy, update the variable; the old token stops working
at the restart. A leaked token gives read access to every feedback (reporters' addresses
included) and every shared journal, and the right to change statuses and notes — never to
delete. Failed authentications are limited to 20 per 15 minutes per address, all MCP calls
to 600 per hour per address.

## Deployment

`.github/workflows/feedback.yml` tests every change under `feedback/`. On `main` only, it
publishes `ghcr.io/lindecker-charles/gup-feedback:sha-<commit>` (no moving tag: the host
runs the exact commit) and deploys on a manual run — or on every push once the repository
variable `FEEDBACK_AUTO_DEPLOY` is `true`. A manual run from another branch only tests.
Pull-request runs are superseded by newer pushes; runs on `main` are never cancelled.

The deploy job copies `compose.yaml` and `compose.deploy.yaml` to
`/opt/gup-feedback-prod` on the VPS, writes its `.env` (mode `600`) from the
`FEEDBACK_ENV_FILE` secret plus `IMAGE_TAG`, pulls the image (with retries), runs
`docker compose up -d --remove-orphans` as project `gup-feedback-prod`, and probes
`/healthz` through the edge until it answers.

| Setting | Kind | Content |
|---|---|---|
| `FEEDBACK_SSH_HOST` | secret | VPS address |
| `FEEDBACK_SSH_USER` | secret | deploy user: member of `docker`, may create `/opt/gup-feedback-prod` |
| `FEEDBACK_SSH_KEY` | secret | private key of that user (no passphrase) |
| `FEEDBACK_SSH_KNOWN_HOSTS` | secret | the host's `known_hosts` lines (`ssh-keyscan -H <host>`, checked against the host's own fingerprints); the job stops without it |
| `FEEDBACK_ENV_FILE` | secret | the production `.env`, shaped like [`.env.example`](.env.example) |
| `FEEDBACK_PUBLIC_URL` | variable | public URL, for the probe and the `feedback` environment link |
| `FEEDBACK_AUTO_DEPLOY` | variable, optional | `true` to deploy every push to `main` |

Maintainers derive these from the secrets vault (project `GlobalUpdater`), never the other
way round: `feedback/prod.env` is `FEEDBACK_ENV_FILE`, `feedback/deploy.key` is
`FEEDBACK_SSH_KEY` (its public half sits in the host's `authorized_keys`), and
`feedback/prod-client.env` keeps what never reaches the server — the admin password and the
MCP token. Change the vault first, deposit it (`coffre deployer GlobalUpdater`), then push
from Git Bash, through stdin: `gh secret set FEEDBACK_ENV_FILE < feedback/prod.env`.

Prerequisites on the host:

- the shared Caddy edge running, with its external Docker network `edge` — the job stops
  if the network is missing. The service joins it with the labels `caddy` (from
  `CADDY_DOMAINS`) and `caddy.reverse_proxy: {{upstreams 8080}}`; it publishes no port.
- a DNS `A` record from the service's domain to the VPS, so the edge can obtain its
  certificate.

The image pull uses the job's own short-lived token; the package stays private.

The deploy key reaches a `docker` group member, which amounts to root on the host. Keep
it to this job and fence it in the user's `~/.ssh/authorized_keys`: no forwarding, no
PTY, and only from GitHub's runners if the host's firewall cannot do it instead.

```text
restrict,from="<runner ranges>" ssh-ed25519 AAAA… gup-feedback-deploy
```

`restrict` disables port, agent and X11 forwarding and PTY allocation while leaving the
commands the job runs (`ssh target "<command>"`, `scp`). A `command="…"` wrapper would
fence it further but has to allow each of them; drop `from=` when the runners' ranges
are not stable enough to pin.

## Backups (follow-up)

The database lives in the `postgres-data` volume of the `gup-feedback-prod` project and
is **not backed up yet**. The planned route is the host's shared backup job: attach
`postgres` to the external `sauvegardes` network under the alias
`gup-feedback-postgres` and register a nightly `pg_dump`, as the infrastructure's backup
rules (§7) describe. Until then, a manual dump:

```sh
cd /opt/gup-feedback-prod
docker compose -f compose.yaml -f compose.deploy.yaml exec -T postgres \
  pg_dump -U gup_feedback gup_feedback > gup-feedback-$(date +%F).sql
```
