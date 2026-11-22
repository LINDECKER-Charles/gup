import { randomBytes } from "node:crypto";

const TOKEN_BYTES = 32;

/** 32 random bytes, base64url without padding (43 characters). */
export function randomToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}
