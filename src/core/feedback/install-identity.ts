import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  type KeyObject,
} from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { writeFileAtomic } from "../config/atomic-write.js";
import { stateDir } from "../state/app-dirs.js";
import { withFileLock } from "../state/file-lock.js";

/**
 * Who this install is to the feedback service: an Ed25519 key pair, and the
 * public install ID derived from its public key — the ID the user pastes
 * into a bug report (`docs/development/feedback-service.md` § The install
 * identity). Requests are signed with the private key, which never leaves
 * the machine; the ID is self-certifying, so nobody else can claim it.
 *
 * Created on first need in the machine-local `feedback` state directory —
 * never in `config.json`, which roams with the profile and gets shared — and
 * kept for good. The file is private (0600 where modes exist) and written
 * atomically under a file lock, so two gup processes starting at once agree
 * on one identity. The private key is never printed nor logged.
 */

export interface InstallIdentity {
  /** UUID v4 shape, lower case, derived from the public key. */
  readonly installId: string;
  /** The raw 32-byte public key, base64url without padding (43 characters). */
  readonly publicKey: string;
  readonly privateKey: KeyObject;
}

/** Exported for the tests, which look at the file. */
export const IDENTITY_FILE = "identity.json";

const IDENTITY_VERSION = 2;
const KEY_TYPE = "ed25519";
const DIR_MODE = 0o700;
const ID_BYTES = 16;
const VERSION_BYTE = 6;
const VARIANT_BYTE = 8;
/** Where the hex digest is cut into the 8-4-4-4-12 groups of a UUID. */
const UUID_GROUPS = [8, 12, 16, 20] as const;

/**
 * This install's identity, created when the state directory holds none (or
 * one that is not valid); null when the platform gives no state directory.
 * Throws on an I/O failure, an identity file that cannot be read included:
 * callers that must not fail catch it.
 */
export function loadInstallIdentity(
  dir: string | null = stateDir("feedback"),
): InstallIdentity | null {
  if (dir === null) return null;
  const existing = readInstallIdentity(dir);
  if (existing !== null) return existing;
  const file = join(dir, IDENTITY_FILE);
  mkdirSync(dir, { recursive: true, mode: DIR_MODE });
  return withFileLock(file, () => readIdentity(file) ?? createIdentity(file));
}

/**
 * The identity already created, or null when there is none (or no valid
 * one) — never creates one. Throws when the file exists but cannot be read.
 */
export function readInstallIdentity(
  dir: string | null = stateDir("feedback"),
): InstallIdentity | null {
  return dir === null ? null : readIdentity(join(dir, IDENTITY_FILE));
}

function createIdentity(file: string): InstallIdentity {
  const { privateKey } = generateKeyPairSync(KEY_TYPE);
  const der = privateKey.export({ format: "der", type: "pkcs8" }).toString("base64url");
  // writeFileAtomic creates its temp file 0600: the rename keeps that mode.
  writeFileAtomic(file, `${JSON.stringify({ v: IDENTITY_VERSION, privateKey: der })}\n`);
  return identityOf(privateKey);
}

/**
 * The identity the file holds, or null when it is missing or not a valid
 * one (an earlier format included). Any other failure — a file that exists
 * but cannot be read — throws: a key that may still be good is never
 * replaced by a new one.
 */
function readIdentity(file: string): InstallIdentity | null {
  const text = readOrNull(file);
  if (text === null) return null;
  try {
    const raw = JSON.parse(text) as Record<string, unknown> | null;
    if (raw?.["v"] !== IDENTITY_VERSION || typeof raw["privateKey"] !== "string") return null;
    const der = Buffer.from(raw["privateKey"], "base64url");
    const privateKey = createPrivateKey({ key: der, format: "der", type: "pkcs8" });
    return privateKey.asymmetricKeyType === KEY_TYPE ? identityOf(privateKey) : null;
  } catch {
    return null;
  }
}

function readOrNull(file: string): string | null {
  try {
    return readFileSync(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException | null)?.code === "ENOENT") return null;
    throw error;
  }
}

function identityOf(privateKey: KeyObject): InstallIdentity {
  const jwk = createPublicKey(privateKey).export({ format: "jwk" });
  const publicKey = String(jwk.x);
  return { installId: installIdOf(publicKey), publicKey, privateKey };
}

/** sha256 of the raw public key, cut to 16 bytes, stamped version 4 / RFC 4122 variant. */
function installIdOf(publicKey: string): string {
  const raw = Buffer.from(publicKey, "base64url");
  const digest = createHash("sha256").update(raw).digest().subarray(0, ID_BYTES);
  digest[VERSION_BYTE] = (digest[VERSION_BYTE]! & 0x0f) | 0x40;
  digest[VARIANT_BYTE] = (digest[VARIANT_BYTE]! & 0x3f) | 0x80;
  const hex = digest.toString("hex");
  const cuts = [0, ...UUID_GROUPS, hex.length];
  return cuts.slice(1).map((end, index) => hex.slice(cuts[index], end)).join("-");
}
