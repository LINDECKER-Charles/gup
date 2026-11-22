import { FEEDBACK_VOCABULARY, type NewFeedback } from "./feedback.js";
import { FieldReader } from "./field-reader.js";
import { FIELD_RULES } from "./field-rules.js";
import { readClientFacts } from "./read-client-facts.js";
import type { ValidationResult } from "./validation-result.js";

/** Validates a posted feedback (JSON or form fields) against the contract. */
export function validateFeedback(body: unknown): ValidationResult<NewFeedback> {
  const reader = new FieldReader(body);
  const installId = reader.optionalText("installId", { max: 36, ...FIELD_RULES.installId });
  const value: NewFeedback = {
    kind: reader.requiredChoice("kind", FEEDBACK_VOCABULARY.kinds),
    title: reader.requiredText("title", FIELD_RULES.title),
    message: reader.requiredText("message", FIELD_RULES.message),
    email: reader.optionalText("email", FIELD_RULES.email),
    installId: installId?.toLowerCase() ?? null,
    ...readClientFacts(reader),
  };
  return reader.invalidFields.length > 0
    ? { ok: false, fields: reader.invalidFields }
    : { ok: true, value };
}
