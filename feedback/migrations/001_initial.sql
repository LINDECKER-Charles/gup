-- Initial schema of the feedback service (docs/development/feedback-service.md).

CREATE TABLE feedback (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kind         text        NOT NULL CHECK (kind IN ('bug', 'suggestion')),
  status       text        NOT NULL DEFAULT 'new'
                           CHECK (status IN ('new', 'in_progress', 'resolved', 'dismissed')),
  title        text        NOT NULL,
  message      text        NOT NULL,
  email        text        NULL,
  -- Not a foreign key: a reporter may paste the ID of an install that never
  -- shared its journals, and erasing an install keeps its feedback.
  install_id   uuid        NULL,
  gup_version  text        NULL,
  platform     text        NULL,
  locale       text        NULL,
  note         text        NOT NULL DEFAULT '',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX feedback_status_created_idx ON feedback (status, created_at DESC, id DESC);
CREATE INDEX feedback_created_idx ON feedback (created_at DESC, id DESC);
CREATE INDEX feedback_install_idx ON feedback (install_id) WHERE install_id IS NOT NULL;

-- One row per notification mail, inserted in the same transaction as its
-- feedback. The mail is rendered when sent, so a feedback deleted before its
-- mail left takes the mail with it.
CREATE TABLE mail_outbox (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  feedback_id     bigint      NOT NULL REFERENCES feedback (id) ON DELETE CASCADE,
  attempts        integer     NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  sent_at         timestamptz NULL,
  last_error      text        NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX mail_outbox_due_idx ON mail_outbox (next_attempt_at) WHERE sent_at IS NULL;

-- One row per install that shared journals, created by its first non-empty
-- batch. The ID derives from the install's public key: every request is
-- signed, so nothing secret is stored here.
CREATE TABLE install (
  id            uuid        PRIMARY KEY,
  gup_version   text        NULL,
  platform      text        NULL,
  arch          text        NULL,
  node_version  text        NULL,
  locale        text        NULL,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX install_last_seen_idx ON install (last_seen_at DESC);

CREATE TABLE install_history_item (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  install_id  uuid        NOT NULL REFERENCES install (id) ON DELETE CASCADE,
  -- sha256 of the item's canonical JSON: the deduplication key.
  item_hash   bytea       NOT NULL,
  ts          timestamptz NOT NULL,
  run_id      text        NOT NULL,
  kind        text        NOT NULL CHECK (kind IN ('scan', 'update')),
  status      text        NULL,
  data        jsonb       NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT install_history_item_dedupe UNIQUE (install_id, item_hash)
);

CREATE INDEX install_history_item_kind_idx ON install_history_item (install_id, kind, ts DESC);
CREATE INDEX install_history_item_received_idx ON install_history_item (received_at);

CREATE TABLE install_log_item (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  install_id  uuid        NOT NULL REFERENCES install (id) ON DELETE CASCADE,
  item_hash   bytea       NOT NULL,
  ts          timestamptz NOT NULL,
  run_id      text        NOT NULL,
  -- 0 = error … 4 = trace, the CLI's own ranking: "at least warn" is rank <= 1.
  level_rank  smallint    NOT NULL CHECK (level_rank BETWEEN 0 AND 4),
  event       text        NOT NULL,
  data        jsonb       NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT install_log_item_dedupe UNIQUE (install_id, item_hash)
);

CREATE INDEX install_log_item_ts_idx ON install_log_item (install_id, ts DESC);
CREATE INDEX install_log_item_received_idx ON install_log_item (received_at);

CREATE TABLE admin_session (
  -- sha256 of the cookie value: a database dump yields no usable session.
  token_hash   bytea       PRIMARY KEY,
  csrf_token   text        NOT NULL,
  created_at   timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL,
  expires_at   timestamptz NOT NULL
);

CREATE INDEX admin_session_expires_idx ON admin_session (expires_at);
