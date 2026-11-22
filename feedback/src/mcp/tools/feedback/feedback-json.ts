import type { Feedback } from "../../../domain/feedback.js";

/** Enough of the message to judge relevance in a list; get_feedback has the rest. */
const PREVIEW_LENGTH = 280;

function preview(message: string): string {
  return message.length <= PREVIEW_LENGTH ? message : `${message.slice(0, PREVIEW_LENGTH)}…`;
}

/** Feedback as tools return it: plain JSON, ISO 8601 dates. */
export const FEEDBACK_JSON = {
  /** Every field, the note included. */
  full: (feedback: Feedback) => ({
    ...feedback,
    createdAt: feedback.createdAt.toISOString(),
    updatedAt: feedback.updatedAt.toISOString(),
  }),

  /** A list item: the message cut to a preview, no note. */
  summary: (feedback: Feedback) => ({
    id: feedback.id,
    kind: feedback.kind,
    status: feedback.status,
    title: feedback.title,
    messagePreview: preview(feedback.message),
    messageLength: feedback.message.length,
    hasNote: feedback.note !== "",
    hasEmail: feedback.email !== null,
    installId: feedback.installId,
    gupVersion: feedback.gupVersion,
    platform: feedback.platform,
    createdAt: feedback.createdAt.toISOString(),
  }),

  /** One line: `#42 [new] bug 2026-11-20 "Title" install=…`. */
  line: (feedback: Feedback): string => {
    const install = feedback.installId === null ? "" : ` install=${feedback.installId}`;
    const day = feedback.createdAt.toISOString().slice(0, 10);
    return `#${feedback.id} [${feedback.status}] ${feedback.kind} ${day} `
      + `${JSON.stringify(feedback.title)}${install}`;
  },
} as const;
