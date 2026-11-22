import type { Pool } from "pg";
import type { HealthProbe } from "../ports/health-probe.js";

export class PgHealthProbe implements HealthProbe {
  readonly #pool: Pool;

  constructor(pool: Pool) {
    this.#pool = pool;
  }

  async isHealthy(): Promise<boolean> {
    try {
      await this.#pool.query("SELECT 1");
      return true;
    } catch {
      return false;
    }
  }
}
