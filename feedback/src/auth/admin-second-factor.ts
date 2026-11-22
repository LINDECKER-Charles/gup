import type { Clock } from "../ports/clock.js";
import type { SecondFactorStore } from "../ports/second-factor-store.js";
import type { Totp } from "./totp.js";

/** People type "123 456" as often as "123456". */
const SEPARATORS = /[\s-]/g;
const DIGITS_ONLY = /^\d+$/;

export interface AdminSecondFactorDeps {
  readonly totp: Totp;
  readonly store: SecondFactorStore;
  readonly clock: Clock;
}

/**
 * The admin's second factor: a TOTP code from the authenticator app enrolled
 * with ADMIN_TOTP_SECRET. A code is good once: the step it belongs to is
 * claimed, so a code seen over a shoulder or in a proxy log opens nothing.
 */
export class AdminSecondFactor {
  readonly #totp: Totp;
  readonly #store: SecondFactorStore;
  readonly #clock: Clock;

  constructor(deps: AdminSecondFactorDeps) {
    this.#totp = deps.totp;
    this.#store = deps.store;
    this.#clock = deps.clock;
  }

  get digits(): number {
    return this.#totp.digits;
  }

  async verify(input: string): Promise<boolean> {
    const code = input.replace(SEPARATORS, "");
    if (code.length !== this.#totp.digits || !DIGITS_ONLY.test(code)) return false;
    const counter = this.#totp.match(code, this.#clock.now());
    return counter !== null && this.#store.claim(counter);
  }
}
