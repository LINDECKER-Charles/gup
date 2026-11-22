import { createHash, createPublicKey, verify } from "node:crypto";

/**
 * The service's side of `docs/development/feedback-service.md` § Request
 * signature, rebuilt independently of the CLI's code: whether an
 * `Authorization` header signs this request.
 */
export interface SignedCall {
  readonly authorization: string;
  readonly method: string;
  /** The URL the service sees; its origin and path are what the signature must cover. */
  readonly url: string;
  readonly body: string;
}

const HEADER = /^GupInstall ([A-Za-z0-9_-]{43})\.(\d+)\.([A-Za-z0-9_-]{86})$/;

export function parseSignatureHeader(authorization: string) {
  const match = HEADER.exec(authorization);
  if (match === null) throw new Error(`not a GupInstall header: ${authorization}`);
  return { publicKey: match[1]!, ts: match[2]!, signature: match[3]! };
}

export function isSignedBy(call: SignedCall): boolean {
  const { publicKey, ts, signature } = parseSignatureHeader(call.authorization);
  const { origin, pathname } = new URL(call.url);
  const bodyHash = createHash("sha256").update(call.body, "utf8").digest("base64url");
  const signed = `gup-install-v1\n${call.method}\n${origin}${pathname}\n${ts}\n${bodyHash}`;
  const key = createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x: publicKey }, format: "jwk" });
  return verify(null, Buffer.from(signed, "utf8"), key, Buffer.from(signature, "base64url"));
}

/** The install ID the service derives from a raw public key (base64url). */
export function installIdOf(publicKey: string): string {
  const digest = createHash("sha256").update(Buffer.from(publicKey, "base64url")).digest();
  const bytes = Buffer.from(digest.subarray(0, 16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join(
    "-",
  );
}
