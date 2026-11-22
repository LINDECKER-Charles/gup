import { generateKeyPairSync, sign, type KeyObject } from "node:crypto";
import { deriveInstallId } from "../../src/identity/derive-install-id.js";
import { installSigningString, type SignedParts } from "../../src/identity/install-signing-string.js";

export interface RequestToSign extends Omit<SignedParts, "ts"> {
  /** Epoch milliseconds; now when absent. */
  readonly signedAtMs?: number;
}

/**
 * The client side of an install identity, as the CLI implements it: an
 * Ed25519 key pair, its derived install ID and the request signature. Used
 * by the tests and the demo seed; the service itself only verifies.
 */
export class InstallKey {
  readonly #privateKey: KeyObject;
  readonly rawPublicKey: Buffer;
  readonly installId: string;

  private constructor(privateKey: KeyObject, publicKey: KeyObject) {
    this.#privateKey = privateKey;
    const { x } = publicKey.export({ format: "jwk" });
    this.rawPublicKey = Buffer.from(x ?? "", "base64url");
    this.installId = deriveInstallId(this.rawPublicKey);
  }

  static generate(): InstallKey {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    return new InstallKey(privateKey, publicKey);
  }

  /** The `Authorization` header value of a signed request. */
  authorization(request: RequestToSign): string {
    const ts = String(request.signedAtMs ?? Date.now());
    const message = installSigningString({ ...request, ts });
    const signature = sign(null, Buffer.from(message, "utf8"), this.#privateKey);
    const publicKey = this.rawPublicKey.toString("base64url");
    return `GupInstall ${publicKey}.${ts}.${signature.toString("base64url")}`;
  }
}
