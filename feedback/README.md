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
  per hour per address; 5 feedbacks per 10 minutes per address; 10 logins per
  15 minutes per address and 100 per hour overall.
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
| `src/views/` | escaping `html` template tag (`kit/`), French words and formats (`text/`), pages, served assets |
| `src/auth/`, `src/security/` | admin credentials and sessions; hashing, tokens, origin checks |
| `src/identity/` | install IDs and the verification of their signed requests |
| `src/store/` | PostgreSQL adapters of the ports, migration runner |
| `src/mail/`, `src/jobs/` | outbox worker and mail; retention job and task scheduling |
| `assets/` | the back office's stylesheet (`styles/`, one file per layer), fonts, logo and favicons, copied from the landing and served with a content hash |
| `migrations/` | SQL migrations, applied in name order |
| `contract/` | the upload example the tests post |

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
} > dev.env
echo "admin password: $PASSWORD"
```

Then start the service, Postgres and Mailpit:

```sh
docker compose --env-file dev.env -f compose.yaml -f compose.dev.yaml up -d --build
```

| URL | What |
|---|---|
| <http://127.0.0.1:8787/admin> | back office — user `admin`, the password above |
| <http://127.0.0.1:8787/api/feedback> | the API the landing posts to |
| <http://127.0.0.1:8025> | Mailpit: every notification mail lands here |
| `127.0.0.1:5439` | Postgres, user and database `gup_feedback` (`FEEDBACK_DEV_DB_PORT` in `dev.env` moves it) |

Open the back office on `127.0.0.1`, not `localhost`: admin forms are accepted only from
the exact origin of `FEEDBACK_PUBLIC_URL`. The landing's dev servers
(`http://127.0.0.1:5173`, `http://localhost:5173`, `http://127.0.0.1:5180`) are allowed to
post feedback.

Some placeholder data to look at (fictional feedback and two installs with history and
logs; refused when `FEEDBACK_ENV` is `production`):

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
| `FEEDBACK_ENV` | `production` | `development` allows `COOKIE_SECURE=false` and the demo seed |
| `FEEDBACK_LANDING_URL` | `https://lindecker-charles.github.io/gup/` | where a no-JavaScript form returns when its `returnTo` is not allowed |
| `FEEDBACK_ALLOWED_ORIGINS` | the landing's origin | comma-separated origins allowed to post feedback (CORS, form return) |
| `SMTP_URL` | unset | `smtp://` or `smtps://` URL; unset, mails wait in the outbox |
| `MAIL_FROM`, `FEEDBACK_NOTIFY_TO` | required with `SMTP_URL` | sender and recipient of notifications |
| `LOG_RETENTION_DAYS` | `90` | journal items received longer ago are purged daily |
| `OUTBOX_POLL_INTERVAL_SECONDS` | `30` | how often the outbox is checked |
| `TRUST_PROXY` | `loopback,uniquelocal` | peers allowed to set `X-Forwarded-For` (the edge, on a private network): `true`, `false`, or a comma-separated list of `loopback`, `linklocal`, `uniquelocal`, IPs and CIDR ranges |
| `COOKIE_SECURE` | `true` | `false` for local http only: drops `Secure` and the `__Host-` prefix |
| `HOST`, `PORT` | `0.0.0.0`, `8080` | listen address |
| `LOG_LEVEL` | `info` | pino level; logs are JSON lines on stdout |

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
