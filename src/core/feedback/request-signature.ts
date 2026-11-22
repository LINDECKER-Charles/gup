import { createHash, sign } from "node:crypto";
import type { InstallIdentity } from "./install-identity.js";

/**
 * The `Authorization` header of an `/api/installs/{installId}` request
 * (`docs/development/feedback-service.md` § Request signature):
 * `GupInstall <publicKey>.<ts>.<signature>`, the Ed25519 signature covering
 *
 *     gup-install-v1\n<METHOD>\n<origin><pathname>\n<ts>\n<base64url(sha256(rawBody))>
 *
 * The origin is the service the request goes to: a signature captured by
 * another host (a mistyped override) is worth nothing to the real service.
 * Nothing secret is sent.
 */

export interface SignedRequest {
  readonly method: string;
  readonly url: string;
  /** The exact text sent; empty for a request without a body. */
  readonly body: string;
  readonly identity: Pick<InstallIdentity, "publicKey" | "privateKey">;
  /** Epoch milliseconds. */
  readonly signedAt: number;
}

const SCHEME = "GupInstall";
const SIGNATURE_VERSION = "gup-install-v1";

export function signatureHeader(request: SignedRequest): string {
  const { origin, pathname } = new URL(request.url);
  const bodyHash = createHash("sha256").update(request.body, "utf8").digest("base64url");
  const ts = String(Math.trunc(request.signedAt));
  const signed = [SIGNATURE_VERSION, request.method, `${origin}${pathname}`, ts, bodyHash].join(
    "\n",
  );
  const signature = sign(null, Buffer.from(signed, "utf8"), request.identity.privateKey);
  return `${SCHEME} ${request.identity.publicKey}.${ts}.${signature.toString("base64url")}`;
}
