/**
 * JSON for a `<script type="application/json">` block: characters that could
 * end the block or start markup (`<`, `>`, `&`) and the two line terminators
 * old JavaScript parsers choke on are written as `\uXXXX` escapes. The block
 * is never executed; the client reads it with `JSON.parse(textContent)`,
 * which turns the escapes back into the original characters.
 */

const UNSAFE = /[<>&\u2028\u2029]/g;
const HEX = 16;
const ESCAPE_DIGITS = 4;

/** `\u` plus the character's four hex digits: valid JSON for the same character. */
function unicodeEscape(character: string): string {
  return `\\u${character.charCodeAt(0).toString(HEX).padStart(ESCAPE_DIGITS, "0")}`;
}

export function embedJson(value: unknown): string {
  return (JSON.stringify(value) ?? "null").replace(UNSAFE, unicodeEscape);
}
