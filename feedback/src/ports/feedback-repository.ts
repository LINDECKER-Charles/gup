import type {
  Feedback, FeedbackKind, FeedbackStatus, NewFeedback, StatusCounts,
} from "../domain/feedback.js";
import type { Page, PageRequest } from "./page.js";

export interface FeedbackQuery extends PageRequest {
  /** null = every status. */
  readonly status: FeedbackStatus | null;
  /** null = both kinds. */
  readonly kind: FeedbackKind | null;
}

export interface FeedbackRepository {
  /**
   * Stores the feedback and queues its notification mail atomically: a mail
   * server that is down delays the mail, never loses the feedback.
   * Returns the new feedback's id.
   */
  create(feedback: NewFeedback): Promise<number>;
  /** Newest first. */
  list(query: FeedbackQuery): Promise<Page<Feedback>>;
  countByStatus(kind: FeedbackKind | null): Promise<StatusCounts>;
  find(id: number): Promise<Feedback | null>;
  listByInstall(installId: string): Promise<readonly Feedback[]>;
  updateStatus(id: number, status: FeedbackStatus): Promise<void>;
  updateNote(id: number, note: string): Promise<void>;
  remove(id: number): Promise<void>;
}
