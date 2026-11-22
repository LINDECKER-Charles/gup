import type {
  OutboxCounts, OutboxMonitor, RetryRequest, UnsentMail,
} from "../../src/ports/mail/outbox-monitor.js";
import type { Page, PageRequest } from "../../src/ports/page.js";
import { pageOf } from "./page-of.js";

/** Unsent mails the test lists, and counts it sets; `retryNow` acts on the list. */
export class MemoryOutboxMonitor implements OutboxMonitor {
  unsent: UnsentMail[] = [];
  sentRecently = 0;
  readonly countQueries: Date[] = [];

  async counts(sentSince: Date): Promise<OutboxCounts> {
    this.countQueries.push(sentSince);
    return {
      waiting: this.unsent.filter((mail) => mail.attempts === 0).length,
      failing: this.unsent.filter((mail) => mail.attempts > 0).length,
      sentRecently: this.sentRecently,
    };
  }

  async listUnsent(request: PageRequest): Promise<Page<UnsentMail>> {
    return pageOf(this.unsent, request);
  }

  async retryNow(request: RetryRequest): Promise<number> {
    this.unsent = this.unsent.map((mail) => ({
      ...mail,
      nextAttemptAt: request.now,
      attempts: Math.min(mail.attempts, request.maxAttempts - 1),
    }));
    return this.unsent.length;
  }
}
