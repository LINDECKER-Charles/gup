import type { FeedbackKind } from "../../domain/feedback.js";
import type { Page, PageRequest } from "../page.js";

export interface OutboxCounts {
  /** Not sent, never tried. */
  readonly waiting: number;
  /** Not sent, tried at least once (given up included). */
  readonly failing: number;
  /** Sent since the `sentSince` asked for. */
  readonly sentRecently: number;
}

export interface UnsentMail {
  readonly id: number;
  readonly feedbackId: number;
  readonly feedbackKind: FeedbackKind;
  readonly feedbackTitle: string;
  readonly attempts: number;
  readonly nextAttemptAt: Date;
  readonly lastError: string | null;
  readonly createdAt: Date;
}

export interface RetryRequest {
  readonly now: Date;
  /** A mail given up (attempts at this cap) gets exactly one more attempt. */
  readonly maxAttempts: number;
}

/** The back office's view of the notification outbox, and its one lever. */
export interface OutboxMonitor {
  counts(sentSince: Date): Promise<OutboxCounts>;
  /** Oldest first: the order they queued in. */
  listUnsent(request: PageRequest): Promise<Page<UnsentMail>>;
  /** Makes every unsent mail due now; returns how many. */
  retryNow(request: RetryRequest): Promise<number>;
}
