-- Accesses to /mcp, issued from the back office. The token is shown once, at
-- issue; the table keeps its SHA-256, and its last four characters to tell two
-- apart. An access stops working at expires_at or when revoked; the daily purge
-- deletes it 90 days later.
CREATE TABLE mcp_access (
  id           uuid        PRIMARY KEY,
  name         text        NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  token_sha256 bytea       NOT NULL UNIQUE CHECK (length(token_sha256) = 32),
  token_hint   text        NOT NULL CHECK (length(token_hint) = 4),
  permissions  text[]      NOT NULL CHECK (
    cardinality(permissions) > 0
    AND permissions <@ ARRAY['feedback:read', 'feedback:triage', 'journals:read']::text[]),
  created_at   timestamptz NOT NULL,
  expires_at   timestamptz NOT NULL CHECK (expires_at > created_at),
  last_used_at timestamptz,
  revoked_at   timestamptz,
  -- Triaging answers with the whole feedback: it never comes without reading.
  CONSTRAINT mcp_access_triage_reads CHECK (
    NOT 'feedback:triage' = ANY (permissions) OR 'feedback:read' = ANY (permissions))
);
