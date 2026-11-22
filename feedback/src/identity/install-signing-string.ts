import { sha256 } from "../security/sha256.js";

const SIGNATURE_VERSION = "gup-install-v1";

export interface SignedParts {
  /** Upper case, as sent: `POST`, `DELETE`. */
  readonly method: string;
  /** The service origin the client targets, no trailing slash. */
  readonly origin: string;
  /** The request path, without query. */
  readonly pathname: string;
  /** The signing time as sent: epoch milliseconds, decimal. */
  readonly ts: string;
  /** The exact body bytes; empty for a `DELETE`. */
  readonly body: Buffer;
}

/**
 * The string an install signs, one field per line
 * (docs/development/feedback-service.md, "Request signature"):
 * `gup-install-v1\n<METHOD>\n<origin><pathname>\n<ts>\n<base64url(sha256(body))>`.
 */
export function installSigningString(parts: SignedParts): string {
  const bodyDigest = sha256(parts.body).toString("base64url");
  return [
    SIGNATURE_VERSION, parts.method, `${parts.origin}${parts.pathname}`, parts.ts, bodyDigest,
  ].join("\n");
}
