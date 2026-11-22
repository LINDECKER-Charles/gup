-- The admin's second factor (TOTP). A password-checked session waits for its
-- code; after a few wrong codes it is dropped and the password asked again.
ALTER TABLE admin_session
  ADD COLUMN second_factor_due boolean  NOT NULL DEFAULT false,
  ADD COLUMN failed_codes      smallint NOT NULL DEFAULT 0;

-- The last TOTP step a code was accepted for: a code works once, and an older
-- one never again. One row, the single admin account.
CREATE TABLE admin_second_factor (
  id           boolean PRIMARY KEY DEFAULT true CHECK (id),
  last_counter bigint  NOT NULL
);
