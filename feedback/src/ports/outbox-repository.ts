import type { Feedback } from "../domain/feedback.js";

export interface PendingMail {
  readonly id: number;
  /** Attempts so far, this one included. */
  readonly attempts: number;
  readonly feedback: Feedback;
}

export interface ClaimRequest {
  readonly now: Date;
  readonly limit: number;
  /** How long a claimed mail stays invisible to other claimers (a crash mid-send). */
  readonly leaseMs: number;
  readonly maxAttempts: number;
}

export interface MailFailure {
  readonly id: number;
  readonly error: string;
  /** null = give up: the attempts are exhausted. */
  readonly retryAt: Date | null;
}

export interface OutboxRepository {
  /**
   * Leases due mails and counts the attempt — a queue pop, so it both changes
   * state and returns it, on purpose: two workers must never get the same mail.
   */
  claimDue(request: ClaimRequest): Promise<readonly PendingMail[]>;
  markSent(id: number, at: Date): Promise<void>;
  markFailed(failure: MailFailure): Promise<void>;
}
