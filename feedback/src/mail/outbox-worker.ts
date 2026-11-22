import type { FastifyBaseLogger } from "fastify";
import type { MailConfig } from "../config/app-config.js";
import type { Clock } from "../ports/clock.js";
import type { Mailer } from "../ports/mail/mailer.js";
import type { OutboxRepository, PendingMail } from "../ports/mail/outbox-repository.js";
import { feedbackMail } from "./feedback-mail.js";
import type { NotifyRecipient } from "./notify-recipient.js";
import { RETRY_POLICY } from "./retry-policy.js";
import { DURATION_MS } from "../time-units.js";

const BATCH_SIZE = 10;
/** Longer than any SMTP exchange: a lease that expires means the worker died. */
const LEASE_MS = 5 * DURATION_MS.minute;

export interface OutboxWorkerDeps {
  readonly outbox: OutboxRepository;
  readonly mailer: Mailer;
  readonly clock: Clock;
  readonly mail: MailConfig;
  /** Read at each batch: a change in the back office applies to the mails still queued. */
  readonly recipient: Pick<NotifyRecipient, "current">;
  readonly publicOrigin: string;
  readonly logger: FastifyBaseLogger;
}

/** Sends the due notification mails, one claimed batch per run. */
export class OutboxWorker {
  readonly #deps: OutboxWorkerDeps;

  constructor(deps: OutboxWorkerDeps) {
    this.#deps = deps;
  }

  async runOnce(): Promise<void> {
    const pending = await this.#deps.outbox.claimDue({
      now: this.#deps.clock.now(),
      limit: BATCH_SIZE,
      leaseMs: LEASE_MS,
      maxAttempts: RETRY_POLICY.maxAttempts,
    });
    if (pending.length === 0) return;
    const { address } = await this.#deps.recipient.current();
    for (const mail of pending) await this.#deliver(mail, address);
  }

  async #deliver(pending: PendingMail, to: string): Promise<void> {
    const { mailer, outbox, clock, mail, publicOrigin, logger } = this.#deps;
    try {
      await mailer.send(feedbackMail({ feedback: pending.feedback, mail, to, publicOrigin }));
      await outbox.markSent(pending.id, clock.now());
    } catch (error) {
      const isLastAttempt = pending.attempts >= RETRY_POLICY.maxAttempts;
      const retryAt = isLastAttempt
        ? null
        : new Date(clock.now().getTime() + RETRY_POLICY.delayAfter(pending.attempts));
      const message = (error as Error).message;
      await outbox.markFailed({ id: pending.id, error: message, retryAt });
      const context = { outboxId: pending.id, attempts: pending.attempts, error: message };
      if (isLastAttempt) logger.error(context, "notification mail given up");
      else logger.warn(context, "notification mail failed, will retry");
    }
  }
}
