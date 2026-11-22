/**
 * The form's live region: always in the DOM (a region that appears together
 * with its text is often not announced), empty until there is an outcome.
 * Focusable, so arriving from a plain post's redirect can land on it.
 */

/** @param {{ id: string, status: string | null, messages: Record<string, string> }} props */
export function FeedbackStatus({ id, status, messages }) {
  const tone = status === "sent" ? "ok" : "error";

  return (
    <div
      id={id}
      className={status ? `feedback-status feedback-status--${tone}` : "feedback-status"}
      role="status"
      aria-live="polite"
      tabIndex={-1}
    >
      {status ? messages[status] : null}
    </div>
  );
}
