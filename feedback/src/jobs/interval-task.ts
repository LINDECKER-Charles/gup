import type { FastifyBaseLogger } from "fastify";

export interface IntervalTaskOptions {
  readonly name: string;
  readonly intervalMs: number;
  readonly run: () => Promise<void>;
  readonly logger: FastifyBaseLogger;
}

/**
 * Runs `run` now, then `intervalMs` after each run ends: runs never overlap,
 * a failed run is logged and the next one still comes. `stop` cancels the
 * next run and waits for the one in flight, so shutdown never cuts it short.
 */
export class IntervalTask {
  readonly #options: IntervalTaskOptions;
  #timer: NodeJS.Timeout | null = null;
  #inFlight: Promise<void> | null = null;
  #isStopped = false;

  constructor(options: IntervalTaskOptions) {
    this.#options = options;
  }

  start(): void {
    this.#isStopped = false;
    this.#tick();
  }

  async stop(): Promise<void> {
    this.#isStopped = true;
    if (this.#timer !== null) clearTimeout(this.#timer);
    this.#timer = null;
    await this.#inFlight;
  }

  #tick(): void {
    this.#inFlight = this.#options.run()
      .catch((error: unknown) => {
        this.#options.logger.error({ err: error, task: this.#options.name }, "task failed");
      })
      .finally(() => {
        this.#inFlight = null;
        if (this.#isStopped) return;
        this.#timer = setTimeout(() => this.#tick(), this.#options.intervalMs);
      });
  }
}
