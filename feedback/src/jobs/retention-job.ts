import type { FastifyBaseLogger } from "fastify";
import { AdminSessions } from "../auth/admin-sessions.js";
import { MCP_ACCESS_RULES } from "../domain/mcp-access.js";
import type { Clock } from "../ports/clock.js";
import type { RetentionStore } from "../ports/retention-store.js";
import { DURATION_MS } from "../time-units.js";

export interface RetentionJobDeps {
  readonly store: RetentionStore;
  readonly clock: Clock;
  readonly retentionDays: number;
  readonly logger: FastifyBaseLogger;
}

/**
 * The daily purge: journal items received more than `retentionDays` ago,
 * installs left with nothing and silent as long, dead admin sessions, MCP
 * accesses that stopped working long ago.
 * Feedback is never purged: only the maintainer deletes it.
 */
export class RetentionJob {
  readonly #deps: RetentionJobDeps;

  constructor(deps: RetentionJobDeps) {
    this.#deps = deps;
  }

  static get intervalMs(): number {
    return DURATION_MS.day;
  }

  async run(): Promise<void> {
    const now = this.#deps.clock.now();
    const report = await this.#deps.store.purge({
      journalCutoff: new Date(now.getTime() - this.#deps.retentionDays * DURATION_MS.day),
      now,
      sessionIdleCutoff: new Date(now.getTime() - AdminSessions.idleLifetimeMs),
      mcpAccessCutoff: new Date(now.getTime() - MCP_ACCESS_RULES.historyDays * DURATION_MS.day),
    });
    this.#deps.logger.info({ purged: report }, "retention purge done");
  }
}
