import { createHmac } from "node:crypto";
import { constantTimeEqual } from "../security/constant-time-equal.js";

export interface TotpOptions {
  readonly digits?: number;
  readonly stepSeconds?: number;
  /** Steps accepted on each side of the current one: clock drift, a code typed late. */
  readonly window?: number;
}

/** What every authenticator app supports: HMAC-SHA-1, 6 digits, 30 seconds. */
const DEFAULTS = { digits: 6, stepSeconds: 30, window: 1 } as const;
const MS_PER_SECOND = 1000;
const COUNTER_BYTES = 8;
const OFFSET_MASK = 0x0f;
const SIGN_BIT_MASK = 0x7fffffff;
const DECIMAL = 10;

/**
 * RFC 6238 time-based one-time passwords over an RFC 4226 HOTP. The secret
 * stays inside: callers get codes and step counters, never the key.
 */
export class Totp {
  /** RFC 4226 §4: 128 bits at least (160 recommended). */
  static readonly minSecretBytes = 16;

  readonly #secret: Buffer;
  readonly #digits: number;
  readonly #stepMs: number;
  readonly #window: number;

  constructor(secret: Buffer, options: TotpOptions = {}) {
    if (secret.length < Totp.minSecretBytes) {
      throw new Error(`a TOTP secret needs ${Totp.minSecretBytes} bytes at least`);
    }
    this.#secret = Buffer.from(secret);
    this.#digits = options.digits ?? DEFAULTS.digits;
    this.#stepMs = (options.stepSeconds ?? DEFAULTS.stepSeconds) * MS_PER_SECOND;
    this.#window = options.window ?? DEFAULTS.window;
  }

  get digits(): number {
    return this.#digits;
  }

  counterAt(at: Date): number {
    return Math.floor(at.getTime() / this.#stepMs);
  }

  codeAt(counter: number): string {
    const message = Buffer.alloc(COUNTER_BYTES);
    message.writeBigUInt64BE(BigInt(counter));
    const digest = createHmac("sha1", this.#secret).update(message).digest();
    // RFC 4226 §5.3 dynamic truncation: the last nibble picks 4 bytes of the digest.
    const offset = (digest.at(-1) ?? 0) & OFFSET_MASK;
    const value = digest.readUInt32BE(offset) & SIGN_BIT_MASK;
    return String(value % DECIMAL ** this.#digits).padStart(this.#digits, "0");
  }

  /**
   * The step counter whose code `code` is, within the window around `at`, or
   * null. Every candidate is compared, in constant time: neither the timing
   * nor an early exit tells which step was close.
   */
  match(code: string, at: Date): number | null {
    const current = this.counterAt(at);
    let matched: number | null = null;
    for (let step = -this.#window; step <= this.#window; step += 1) {
      const counter = current + step;
      if (constantTimeEqual(code, this.codeAt(counter)) && matched === null) matched = counter;
    }
    return matched;
  }
}
