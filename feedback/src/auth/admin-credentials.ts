import { constantTimeEqual } from "../security/constant-time-equal.js";
import type { PasswordHash } from "../security/password-hash.js";

/**
 * The single admin account. A login costs one scrypt derivation whatever the
 * user name — right or wrong — so the response time tells nothing about
 * which half of the credentials failed.
 */
export class AdminCredentials {
  readonly #username: string;
  readonly #passwordHash: PasswordHash;

  constructor(account: { readonly username: string; readonly passwordHash: PasswordHash }) {
    this.#username = account.username;
    this.#passwordHash = account.passwordHash;
  }

  async verify(username: string, password: string): Promise<boolean> {
    const isPasswordValid = await this.#passwordHash.matches(password);
    const isUsernameValid = constantTimeEqual(username, this.#username);
    return isPasswordValid && isUsernameValid;
  }
}
