import { sha256 } from "../security/sha256.js";

/** A UUID is 16 bytes. */
const UUID_BYTES = 16;
const VERSION_BYTE = 6;
const VARIANT_BYTE = 8;
const LOW_NIBBLE = 0x0f;
const VERSION_4 = 0x40;
const LOW_SIX_BITS = 0x3f;
const RFC_4122_VARIANT = 0x80;
/** 32 hex digits, grouped 8-4-4-4-12. */
const UUID_GROUPS = /^(.{8})(.{4})(.{4})(.{4})(.{12})$/;

/**
 * The public install ID of an Ed25519 public key (its raw 32 bytes): the
 * first 16 bytes of its sha256, shaped as a lower-case UUID v4. The service
 * and the CLI compute it the same way (docs/development/feedback-service.md).
 */
export function deriveInstallId(rawPublicKey: Buffer): string {
  const digest = sha256(rawPublicKey).subarray(0, UUID_BYTES);
  digest.writeUInt8(((digest[VERSION_BYTE] ?? 0) & LOW_NIBBLE) | VERSION_4, VERSION_BYTE);
  digest.writeUInt8(((digest[VARIANT_BYTE] ?? 0) & LOW_SIX_BITS) | RFC_4122_VARIANT, VARIANT_BYTE);
  return digest.toString("hex").replace(UUID_GROUPS, "$1-$2-$3-$4-$5");
}
