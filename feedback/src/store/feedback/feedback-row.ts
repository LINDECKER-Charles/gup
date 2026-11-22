import type { Feedback, FeedbackKind, FeedbackStatus, Platform } from "../../domain/feedback.js";

export interface FeedbackRow {
  id: string;
  kind: FeedbackKind;
  status: FeedbackStatus;
  title: string;
  message: string;
  email: string | null;
  install_id: string | null;
  gup_version: string | null;
  platform: Platform | null;
  locale: string | null;
  note: string;
  created_at: Date;
  updated_at: Date;
}

/** `id` is a bigint, which pg returns as a string; feedback ids stay far below 2^53. */
export function toFeedback(row: FeedbackRow): Feedback {
  return {
    id: Number(row.id),
    kind: row.kind,
    status: row.status,
    title: row.title,
    message: row.message,
    email: row.email,
    installId: row.install_id,
    gupVersion: row.gup_version,
    platform: row.platform,
    locale: row.locale,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
