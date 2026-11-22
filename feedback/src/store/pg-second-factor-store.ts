import type { Pool } from "pg";
import type { SecondFactorStore } from "../ports/second-factor-store.js";

export class PgSecondFactorStore implements SecondFactorStore {
  readonly #pool: Pool;

  constructor(pool: Pool) {
    this.#pool = pool;
  }

  /** One statement: two logins racing with the same code cannot both claim it. */
  async claim(counter: number): Promise<boolean> {
    const { rowCount } = await this.#pool.query(
      `INSERT INTO admin_second_factor (id, last_counter) VALUES (true, $1)
       ON CONFLICT (id) DO UPDATE SET last_counter = EXCLUDED.last_counter
       WHERE admin_second_factor.last_counter < EXCLUDED.last_counter`, [counter]);
    return rowCount === 1;
  }
}
