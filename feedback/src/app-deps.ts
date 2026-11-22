import type { FastifyServerOptions } from "fastify";
import type { AppConfig } from "./config/app-config.js";
import type { Clock } from "./ports/clock.js";
import type { FeedbackRepository } from "./ports/feedback-repository.js";
import type { HealthProbe } from "./ports/health-probe.js";
import type { InstallReader } from "./ports/install-reader.js";
import type { InstallStore } from "./ports/install-store.js";
import type { Mailer } from "./ports/mail/mailer.js";
import type { OutboxMonitor } from "./ports/mail/outbox-monitor.js";
import type { SessionRepository } from "./ports/session-repository.js";

/** Everything the HTTP application needs, as ports: tests pass in-memory fakes. */
export interface AppDeps {
  readonly config: AppConfig;
  readonly feedback: FeedbackRepository;
  readonly installs: InstallStore;
  readonly journals: InstallReader;
  /** The notification outbox, as the back office watches it. */
  readonly outbox: OutboxMonitor;
  /** The relay the outbox worker sends through; null when SMTP is not configured. */
  readonly mailer: Mailer | null;
  readonly sessions: SessionRepository;
  readonly health: HealthProbe;
  readonly clock: Clock;
  /** Fastify logger settings; false silences it (tests). */
  readonly logger: NonNullable<FastifyServerOptions["logger"]>;
}
