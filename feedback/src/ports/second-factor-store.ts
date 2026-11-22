/** The TOTP step counters the admin has already used: a code opens one session only. */
export interface SecondFactorStore {
  /**
   * Records `counter` as used, atomically, unless it or a later one already
   * was. Returns false for a replayed or superseded code.
   */
  claim(counter: number): Promise<boolean>;
}
