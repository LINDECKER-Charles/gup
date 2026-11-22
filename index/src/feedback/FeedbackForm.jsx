/**
 * The feedback form. Prerendered as a plain `method="post"` form to the
 * service (urlencoded; the service answers with a redirect back to
 * `returnTo`), then taken over by `useFeedbackForm` after hydration:
 * `noValidate` hands validation to our translated messages and `submit`
 * posts JSON with `fetch`.
 */
import { useI18n } from "../i18n/use-i18n.js";
import { Field } from "./Field.jsx";
import { FeedbackStatus } from "./FeedbackStatus.jsx";
import { HiddenFields } from "./HiddenFields.jsx";
import { KindField } from "./KindField.jsx";
import { LIMITS } from "./rules.js";
import { FEEDBACK_ENDPOINT } from "./submit-feedback.js";
import { useFeedbackForm } from "./use-feedback-form.js";
import { RichText } from "../ui/RichText.jsx";

const STATUS_ID = "feedback-status";

function Context({ label, context }) {
  const parts = [context.gupVersion && `gup ${context.gupVersion}`, context.platform];
  const shown = parts.filter(Boolean);
  if (!shown.length) return null;
  return (
    <p className="feedback-context">
      {label} <code translate="no">{shown.join(" · ")}</code>
    </p>
  );
}

export function FeedbackForm() {
  const { locale, messages } = useI18n();
  const { feedback } = messages;
  const form = useFeedbackForm(locale);
  const { values, setValue, invalidFields } = form;
  const errorOf = (name) => (invalidFields.includes(name) ? feedback.errors[name] : undefined);
  const bind = (name) => ({
    value: values[name],
    onChange: (event) => setValue(name, event.target.value),
    error: errorOf(name),
  });

  return (
    <form
      className="feedback-form"
      method="post"
      action={FEEDBACK_ENDPOINT}
      noValidate={form.isHydrated}
      onSubmit={form.submit}
      data-reveal={0}
    >
      <KindField kinds={feedback.kinds} value={values.kind} onChange={(kind) => setValue("kind", kind)} />
      <Field
        name="title"
        label={feedback.fields.title.label}
        required
        minLength={LIMITS.title.min}
        maxLength={LIMITS.title.max}
        autoComplete="off"
        {...bind("title")}
      />
      <Field
        as="textarea"
        name="message"
        label={feedback.fields.message.label}
        hint={feedback.fields.message.hint}
        count={{
          length: values.message.length,
          max: LIMITS.message.max,
          unit: feedback.fields.message.unit,
        }}
        rows={7}
        required
        minLength={LIMITS.message.min}
        maxLength={LIMITS.message.max}
        {...bind("message")}
      />
      <div className="field-pair">
        <Field
          type="email"
          name="email"
          label={feedback.fields.email.label}
          optionalLabel={feedback.optional}
          hint={feedback.fields.email.hint}
          maxLength={LIMITS.email.max}
          autoComplete="email"
          {...bind("email")}
        />
        <Field
          name="installId"
          label={feedback.fields.installId.label}
          optionalLabel={feedback.optional}
          hint={feedback.fields.installId.hint}
          maxLength={LIMITS.installId.max}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          dir="ltr"
          {...bind("installId")}
        />
      </div>
      <HiddenFields
        locale={locale.id}
        returnTo={form.returnTo}
        startedAt={form.startedAt}
        context={form.context}
      />
      <FeedbackStatus id={STATUS_ID} status={form.status} messages={feedback.status} />
      <div className="feedback-actions">
        <button className="btn btn--primary" type="submit" disabled={form.isSending}>
          {form.isSending ? feedback.sending : feedback.submit}
        </button>
      </div>
      <Context label={feedback.context} context={form.context} />
      <p className="feedback-privacy">
        <RichText text={feedback.privacy} />
      </p>
    </form>
  );
}
