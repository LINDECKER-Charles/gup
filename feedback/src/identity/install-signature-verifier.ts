import { createPublicKey, verify } from "node:crypto";
import type { Clock } from "../ports/clock.js";
import { DURATION_MS } from "../time-units.js";
import { deriveInstallId } from "./derive-install-id.js";
import { installSigningString } from "./install-signing-string.js";

/** `GupInstall <publicKey>.<ts>.<signature>`: 32-byte key and 64-byte signature, base64url. */
const AUTHORIZATION = /^GupInstall ([A-Za-z0-9_-]{43})\.(\d{1,16})\.([A-Za-z0-9_-]{86})$/;
const PUBLIC_KEY_BYTES = 32;
const SIGNATURE_BYTES = 64;
/**
 * Wide on purpose: a machine with a wrong clock still gets through, and a
 * replay can only repeat an idempotent request to this same service.
 */
const MAX_CLOCK_SKEW_MS = 24 * DURATION_MS.hour;

export interface InstallRequest {
  readonly authorization: string | undefined;
  readonly method: string;
  readonly pathname: string;
  /** The `{installId}` of the path, as received. */
  readonly installId: string;
  readonly body: Buffer;
}

function isValidSignature(rawPublicKey: Buffer, message: string, signature: Buffer): boolean {
  try {
    const key = createPublicKey({
      format: "jwk",
      key: { kty: "OKP", crv: "Ed25519", x: rawPublicKey.toString("base64url") },
    });
    return verify(null, Buffer.from(message, "utf8"), key, signature);
  } catch {
    return false;
  }
}

/**
 * Checks the self-certifying signature of an `/api/installs/{installId}`
 * request: the key in the header must derive to the path's ID, the signing
 * time must be within a day of this clock, and the signature must cover this
 * service's origin, the method, the path, the time and the exact body.
 */
export class InstallSignatureVerifier {
  readonly #origin: string;
  readonly #clock: Clock;

  constructor(origin: string, clock: Clock) {
    this.#origin = origin;
    this.#clock = clock;
  }

  isAuthentic(request: InstallRequest): boolean {
    const match = AUTHORIZATION.exec(request.authorization ?? "");
    if (match === null) return false;
    const [, encodedKey = "", ts = "", encodedSignature = ""] = match;
    const rawPublicKey = Buffer.from(encodedKey, "base64url");
    const signature = Buffer.from(encodedSignature, "base64url");
    const isWellSized = rawPublicKey.length === PUBLIC_KEY_BYTES
      && signature.length === SIGNATURE_BYTES;
    if (!isWellSized || deriveInstallId(rawPublicKey) !== request.installId) return false;
    if (!this.#isFresh(Number(ts))) return false;
    const { method, pathname, body } = request;
    const message = installSigningString({ method, origin: this.#origin, pathname, ts, body });
    return isValidSignature(rawPublicKey, message, signature);
  }

  #isFresh(signedAtMs: number): boolean {
    return Math.abs(this.#clock.now().getTime() - signedAtMs) <= MAX_CLOCK_SKEW_MS;
  }
}
