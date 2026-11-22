# feedback-backoffice

## Added

- **core/feedback:** each install owns an Ed25519 key pair, created on first explicit need and
  kept in the machine-local state directory; its public install ID (UUID shape) derives from
  the public key, so it cannot be claimed by anyone else. When the user agreed, the history and
  the debug log are redacted the way `gup log export` does (environment and OS release dropped
  as well) and uploaded in signed batches of at most 1000 items after a menu session, an
  update, a list or a scheduled run, within a 5 s budget; nothing is sent while the question
  is unanswered or `GUP_SHARE_LOGS` is off
  (`feat(core/feedback): give each install a signing key and share its journals`)
- **ui:** a Feedback view in the menu (install ID, form link, copy), a "Share journals" row in
  Options, and the one-time consent question, default no
  (`feat(ui): add the Feedback view and the journal-sharing question`)
- **cli:** `gup feedback` opens the feedback form prefilled with the install ID, version and
  platform; `gup feedback id`, `gup feedback share on|off` (off erases what was shared from the
  service) and `gup feedback status`; `gup doctor` shows the sharing state. The question is
  asked once before the menu, `update` or `list`, never in unattended runs
  (`feat(cli): ask to share journals and add gup feedback`)
- **feedback:** the feedback service: a Fastify and PostgreSQL service that receives the
  landing's form and the shared journals, relays every new feedback by mail through an outbox
  (`Reply-To` set to the reporter), and serves a French back office without client script
  (inbox by status and kind, detail with notes, installs and their journals, erase)
  (`feat(feedback): add the feedback service and its back office`)
- **feedback:** the back office takes the landing's design (fonts, colours, logo, favicons,
  served by the service), its inbox gains a search over title, message, address, install ID
  and number, status changes take one click, deletions sit behind a folded confirmation,
  and every table stacks into cards on a phone
  (`feat(feedback): redesign the back office on the landing's design`)
- **landing:** a Feedback section with a bug/suggestion form that works with and without
  JavaScript, prefilled by the CLI's link, in the eight languages
  (`feat(landing): add the feedback form`)

## CI

- **feedback:** a workflow that tests the service against PostgreSQL, publishes its image to
  GHCR from `main` and deploys it to the VPS behind the shared Caddy edge
  (`ci(feedback): test, publish and deploy the feedback service`)
- **dependabot:** the service's npm, Docker and Compose dependencies, majors of `node` and
  `postgres` excluded (`ci(dependabot): watch the feedback service's dependencies`)

## Documentation

- **docs:** the contract between the CLI, the landing and the service
  (`docs/development/feedback-service.md`), a guide to feedback and journal sharing, and the
  new commands, settings and variables in the CLI reference
  (`docs: document the feedback service and journal sharing`)
