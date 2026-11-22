import { Totp } from "../auth/totp.js";
import { base32Decode } from "../security/base32.js";
import type { FeedbackEnv } from "./app-config.js";
import type { EnvReader } from "./env-reader.js";

const NAME = "ADMIN_TOTP_SECRET";

/**
 * The base32 key of the admin's authenticator app. Required in production:
 * the back office reads every feedback and journal, a password alone is not
 * enough. Unset in development, the password alone signs in.
 */
export function readTotpSecret(reader: EnvReader, env: FeedbackEnv): Buffer | null {
  const raw = reader.optional(NAME);
  if (raw === null) {
    if (env === "production") reader.reject(NAME, "is required with FEEDBACK_ENV=production");
    return null;
  }
  try {
    const secret = base32Decode(raw);
    if (secret.length >= Totp.minSecretBytes) return secret;
  } catch {
    // Reported below, with the same message as a short key.
  }
  reader.reject(NAME, `must be base32 for ${Totp.minSecretBytes} bytes at least `
    + "(npm run -s admin:totp -- secret prints one)");
  return null;
}
