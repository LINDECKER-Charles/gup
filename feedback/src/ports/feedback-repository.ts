import type {
  Feedback, FeedbackKind, FeedbackStatus, NewFeedback, StatusCounts,
} from "../domain/feedback.js";
import type { Page, PageRequest } from "./page.js";

export interface FeedbackFilter {
  /** null = both kinds. */
  readonly kind: FeedbackKind | null;
  /**
   * null = no search. Otherwise matches, ignoring case, a part of the title,
   * the message, the address or the install ID, or the feedback's number
   * (`42` or `#42`).
   */
  readonly search: string | null;
}

export interface FeedbackQuery extends FeedbackFilter, PageRequest {
  /** null = every status. */
  readonly status: FeedbackStatus | null;
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
  /** What each status would list under the same kind and search. */
  countByStatus(filter: FeedbackFilter): Promise<StatusCounts>;
  find(id: number): Promise<Feedback | null>;
  listByInstall(installId: string): Promise<readonly Feedback[]>;
  updateStatus(id: number, status: FeedbackStatus): Promise<void>;
  updateNote(id: number, note: string): Promise<void>;
  remove(id: number): Promise<void>;
}
