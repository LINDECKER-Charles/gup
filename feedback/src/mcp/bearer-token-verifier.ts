import { timingSafeEqual } from "node:crypto";
import { sha256 } from "../security/sha256.js";

/**
 * RFC 6750 `b64token` (the scheme name is case-insensitive), bounded: a
 * longer value is not a token anyone was given.
 */
const BEARER_PATTERN = /^Bearer ([A-Za-z0-9\-._~+/]{1,512}=*)$/i;

/**
 * Checks `Authorization: Bearer <token>` against the SHA-256 the service is
 * configured with: the token itself is never held, and the digests are
 * compared in constant time (both are 32 bytes, so nothing leaks a length).
 */
export class BearerTokenVerifier {
  readonly #digest: Buffer;

  constructor(digest: Buffer) {
    this.#digest = digest;
  }

  isAuthorized(authorization: string | undefined): boolean {
    const token = BEARER_PATTERN.exec(authorization ?? "")?.[1];
    return token !== undefined && timingSafeEqual(sha256(token), this.#digest);
  }
}
