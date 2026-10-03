/**
 * Parses the three inline markups a catalog string may carry:
 *
 *   `code`    → <code dir="ltr" translate="no">   (commands, flags, ids)
 *   **text**  → <strong>
 *   [[Key]]   → <kbd>
 *
 * No nesting and no links (links are structural, they live in components).
 * Shared by the build (validation, plain-text extraction for JSON-LD) and by
 * the client (ui/RichText.jsx), so a string that renders is a string that
 * validated. Malformed markup throws instead of leaking `**` or `[[` into the
 * page.
 *
 * @typedef {{ kind: "text" | "code" | "strong" | "kbd", value: string }} RichToken
 */

const MARKUP = /`([^`]*)`|\*\*(.*?)\*\*|\[\[(.*?)\]\]/gu;
const MARKERS = ["`", "**", "[[", "]]"];
const KINDS = ["code", "strong", "kbd"];

const hasMarker = (text) => MARKERS.some((marker) => text.includes(marker));

function textToken(text, source) {
  if (hasMarker(text)) throw new Error(`unbalanced markup in "${source}"`);
  return { kind: "text", value: text };
}

function markupToken(match, source) {
  const group = [match[1], match[2], match[3]].findIndex((value) => value !== undefined);
  const value = match[group + 1];
  if (value === "") throw new Error(`empty markup in "${source}"`);
  if (hasMarker(value)) throw new Error(`nested markup in "${source}"`);
  return { kind: KINDS[group], value };
}

/**
 * @param {string} text
 * @returns {RichToken[]}
 */
export function parseRich(text) {
  const tokens = [];
  let cursor = 0;
  for (const match of text.matchAll(MARKUP)) {
    if (match.index > cursor) tokens.push(textToken(text.slice(cursor, match.index), text));
    tokens.push(markupToken(match, text));
    cursor = match.index + match[0].length;
  }
  if (cursor < text.length) tokens.push(textToken(text.slice(cursor), text));
  return tokens;
}
