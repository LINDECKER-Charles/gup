import { FEEDBACK_VOCABULARY, type ClientFacts } from "./feedback.js";
import type { FieldReader } from "./field-reader.js";
import { FIELD_RULES } from "./field-rules.js";

/** The optional client fields, with the same rules for a feedback and an upload. */
export function readClientFacts(reader: FieldReader): ClientFacts {
  return {
    gupVersion: reader.optionalText("gupVersion", FIELD_RULES.gupVersion),
    platform: reader.optionalChoice("platform", FEEDBACK_VOCABULARY.platforms),
    locale: reader.optionalText("locale", FIELD_RULES.locale),
  };
}
