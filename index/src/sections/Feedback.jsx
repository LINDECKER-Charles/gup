/**
 * 07 · Feedback — report a bug or suggest an improvement. It sits after
 * Install, the page's conversion target, so the form never competes with it,
 * and just above the footer that links to it. The form works without
 * JavaScript (see feedback/FeedbackForm.jsx).
 */
import { FeedbackForm } from "../feedback/FeedbackForm.jsx";
import { useI18n } from "../i18n/use-i18n.js";
import { Section } from "../ui/Section.jsx";

export function Feedback() {
  const { feedback } = useI18n().messages;

  return (
    <Section id="feedback" kicker={feedback.kicker} title={feedback.title} lead={feedback.lead}>
      <FeedbackForm />
    </Section>
  );
}
