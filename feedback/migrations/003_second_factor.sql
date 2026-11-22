-- The admin's second factor (TOTP). How far each session got:
--   due      the password is right, the code not given yet: it opens nothing
--            but the code form, and a few code attempts at most;
--   passed   both factors given;
--   skipped  the password alone, while no TOTP key is configured (development).
-- With a key configured, only `passed` opens the back office: sessions from
-- before this migration, or from a run without the key, are refused.
ALTER TABLE admin_session
  ADD COLUMN second_factor text     NOT NULL DEFAULT 'skipped'
    CHECK (second_factor IN ('due', 'passed', 'skipped')),
  ADD COLUMN code_attempts smallint NOT NULL DEFAULT 0;

-- The last TOTP step a code was accepted for: a code works once, and an older
-- one never again. One row, the single admin account.
CREATE TABLE admin_second_factor (
  id           boolean PRIMARY KEY DEFAULT true CHECK (id),
  last_counter bigint  NOT NULL
);
