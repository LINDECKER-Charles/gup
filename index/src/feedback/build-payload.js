/**
 * The JSON body of `POST /api/feedback`: trimmed, optional fields left out
 * when empty (the service reads an empty string as absent, but a lean body
 * says the same thing without relying on it).
 */

const OPTIONAL = ["email", "installId", "gupVersion", "platform", "startedAt"];

const clean = (value) => (typeof value === "string" ? value.trim() : value);

/**
 * @param {Record<string, string | number | undefined>} fields  Form values plus
 *   the hidden context (`locale`, `gupVersion`, `platform`, `startedAt`).
 * @returns {Record<string, string | number>}
 */
export function buildPayload(fields) {
  const { kind, title, message, locale } = fields;
  const payload = { kind, title: title.trim(), message: message.trim(), locale };
  for (const name of OPTIONAL) {
    const value = clean(fields[name]);
    if (value !== undefined && value !== "") payload[name] = value;
  }
  return payload;
}
