import type { MailConfig } from "../config/app-config.js";
import type { Feedback } from "../domain/feedback.js";
import type { OutgoingMail } from "../ports/mailer.js";
import { formatDate } from "../views/text/format-date.js";
import { LABELS } from "../views/text/labels.js";

export interface FeedbackMailInput {
  readonly feedback: Feedback;
  readonly mail: MailConfig;
  readonly publicOrigin: string;
}

/** A header value on one line: a title cannot smuggle a header in. */
function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function body(feedback: Feedback, adminUrl: string): string {
  const replyHint = feedback.email === null
    ? null
    : `${feedback.email} (répondre à ce mail lui répond)`;
  const facts: [string, string | null][] = [
    ["Adresse", replyHint],
    ["Installation", feedback.installId],
    ["Version de gup", feedback.gupVersion],
    ["Plateforme", feedback.platform === null ? null : LABELS.platform[feedback.platform] ?? null],
    ["Langue", feedback.locale],
  ];
  return [
    `${LABELS.kind[feedback.kind]} #${feedback.id}, reçu le ${formatDate(feedback.createdAt)}.`,
    "",
    `Titre : ${feedback.title}`,
    ...facts.map(([label, value]) => `${label} : ${value ?? "non renseigné"}`),
    "",
    "Message :",
    feedback.message,
    "",
    `Ouvrir dans le back office : ${adminUrl}`,
  ].join("\n");
}

/** The notification of a new feedback: plain text, `Reply-To` the reporter when known. */
export function feedbackMail(input: FeedbackMailInput): OutgoingMail {
  const { feedback, mail } = input;
  const adminUrl = `${input.publicOrigin}/admin/feedback/${feedback.id}`;
  return {
    to: mail.notifyTo,
    from: mail.from,
    replyTo: feedback.email,
    subject: oneLine(`[gup] ${LABELS.kind[feedback.kind]} #${feedback.id} — ${feedback.title}`),
    text: body(feedback, adminUrl),
  };
}
