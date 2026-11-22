-- The address feedback notifications go to, when the back office changed it.
-- No row: FEEDBACK_NOTIFY_TO. One row, read by the outbox worker at each batch.
CREATE TABLE mail_setting (
  id         boolean     PRIMARY KEY DEFAULT true CHECK (id),
  notify_to  text        NOT NULL CHECK (length(notify_to) BETWEEN 3 AND 254),
  updated_at timestamptz NOT NULL
);
