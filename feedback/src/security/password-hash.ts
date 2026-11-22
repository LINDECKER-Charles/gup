import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";

const SCHEME = "scrypt";
// `:` and not `$`: the hash travels through Compose env files, which
// interpolate `$`. base64url never contains `:`.
const SEPARATOR = ":";
const FIELD_COUNT = 6;
const SALT_BYTES = 16;
const KEY_BYTES = 32;
/** OWASP's scrypt equivalent at 32 MiB per hash: N=2^15, r=8, p=3. */
const DEFAULT_COST = { N: 2 ** 15, r: 8, p: 3 } as const;
/**
 * Accepted parameters: never weaker than N=2^14, r=8, p=1, and bounded so a
 * hash pasted into the environment cannot make each login cost more than
 * 64 MiB or several seconds of CPU.
 */
const COST_BOUNDS = {
  N: { min: 2 ** 14, max: 2 ** 17 },
  r: { min: 8, max: 16 },
  p: { min: 1, max: 4 },
  maxMemoryBytes: 64 * 1024 * 1024,
} as const;
/** scrypt uses 128·N·r bytes. */
const BLOCK_BYTES = 128;
/** Node refuses a derivation whose memory reaches `maxmem`: leave it room. */
const MAXMEM_FACTOR = 2;
/** What the startup check derives: any input works, only the cost matters. */
const PROBE_PASSWORD = "cost-probe";

interface ScryptCost {
  readonly N: number;
  readonly r: number;
  readonly p: number;
}

function derive(password: string, salt: Buffer, cost: ScryptCost): Promise<Buffer> {
  const maxmem = MAXMEM_FACTOR * BLOCK_BYTES * cost.N * cost.r;
  const options: ScryptOptions = { ...cost, maxmem };
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_BYTES, options, (error, key) =>
      error === null ? resolve(key) : reject(error),
    );
  });
}

function isPowerOfTwo(value: number): boolean {
  return Number.isSafeInteger(value) && value > 1 && (value & (value - 1)) === 0;
}

function isWithin(value: number, bounds: { readonly min: number; readonly max: number }) {
  return Number.isSafeInteger(value) && value >= bounds.min && value <= bounds.max;
}

function isSaneCost(cost: ScryptCost): boolean {
  const memoryBytes = BLOCK_BYTES * cost.N * cost.r;
  return isPowerOfTwo(cost.N) && isWithin(cost.N, COST_BOUNDS.N)
    && isWithin(cost.r, COST_BOUNDS.r) && isWithin(cost.p, COST_BOUNDS.p)
    && memoryBytes <= COST_BOUNDS.maxMemoryBytes;
}

/** An scrypt password hash, encoded `scrypt:N:r:p:saltB64url:hashB64url`. */
export class PasswordHash {
  readonly #cost: ScryptCost;
  readonly #salt: Buffer;
  readonly #key: Buffer;

  private constructor(cost: ScryptCost, salt: Buffer, key: Buffer) {
    this.#cost = cost;
    this.#salt = salt;
    this.#key = key;
  }

  static async create(password: string): Promise<PasswordHash> {
    const salt = randomBytes(SALT_BYTES);
    return new PasswordHash(DEFAULT_COST, salt, await derive(password, salt, DEFAULT_COST));
  }

  /** Throws on anything but a well-formed encoding with sane cost parameters. */
  static parse(encoded: string): PasswordHash {
    const fields = encoded.trim().split(SEPARATOR);
    const [scheme, n, r, p, salt, key] = fields;
    if (fields.length !== FIELD_COUNT || scheme !== SCHEME) {
      throw new Error(`expected ${SCHEME}:N:r:p:salt:hash`);
    }
    const cost = { N: Number(n), r: Number(r), p: Number(p) };
    if (!isSaneCost(cost)) throw new Error("unsupported scrypt cost parameters");
    const keyBytes = Buffer.from(key ?? "", "base64url");
    const saltBytes = Buffer.from(salt ?? "", "base64url");
    if (keyBytes.length !== KEY_BYTES || saltBytes.length === 0) {
      throw new Error("malformed salt or hash");
    }
    return new PasswordHash(cost, saltBytes, keyBytes);
  }

  /**
   * Derives once with the stored parameters and throws when this host cannot:
   * run at startup, so a hash the runtime refuses fails the deployment rather
   * than every later login.
   */
  async checkDerivable(): Promise<void> {
    await derive(PROBE_PASSWORD, this.#salt, this.#cost);
  }

  async matches(password: string): Promise<boolean> {
    return timingSafeEqual(await derive(password, this.#salt, this.#cost), this.#key);
  }

  toString(): string {
    const { N, r, p } = this.#cost;
    const encodedSalt = this.#salt.toString("base64url");
    return [SCHEME, N, r, p, encodedSalt, this.#key.toString("base64url")].join(SEPARATOR);
  }
}
