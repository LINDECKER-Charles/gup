/** Vocabulary of a feedback, as the contract defines it. */
export const FEEDBACK_VOCABULARY = {
  kinds: ["bug", "suggestion"],
  /** Any transition between statuses is allowed; this order is the triage order. */
  statuses: ["new", "in_progress", "resolved", "dismissed"],
  platforms: ["win32", "darwin", "linux", "other"],
} as const;

export type FeedbackKind = (typeof FEEDBACK_VOCABULARY.kinds)[number];
export type FeedbackStatus = (typeof FEEDBACK_VOCABULARY.statuses)[number];
export type Platform = (typeof FEEDBACK_VOCABULARY.platforms)[number];

/** Optional facts about the reporter's gup, shared by feedback and uploads. */
export interface ClientFacts {
  gupVersion: string | null;
  platform: Platform | null;
  locale: string | null;
}

/** A validated feedback, ready to store. */
export interface NewFeedback extends ClientFacts {
  kind: FeedbackKind;
  title: string;
  message: string;
  email: string | null;
  installId: string | null;
}

export interface Feedback extends NewFeedback {
  id: number;
  status: FeedbackStatus;
  note: string;
  createdAt: Date;
  updatedAt: Date;
}

export type StatusCounts = Record<FeedbackStatus, number>;
