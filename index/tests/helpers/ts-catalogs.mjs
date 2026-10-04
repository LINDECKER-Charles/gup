/**
 * The language blocks of gup's text catalogs, read from a TypeScript source as
 * text, like ./ts-literals.mjs reads its literals. A catalog is a
 * `localized({ en: {…}, fr: {…} })` or `localize({ en: "…", fr: "…" })` call:
 * each property of its argument holds one language's texts. What lies outside
 * every block — marks, keys, the templates that put a language's words
 * together — is written in every language.
 *
 * @typedef {object} SplitSource
 * @property {string} shared  The source with every block blanked out (offsets kept).
 * @property {Map<string, string[]>} byLanguage  The text of each language's blocks.
 */
import { tsCode } from "./ts-literals.mjs";

/** `localized(` or `localize(`, with an optional type argument, opening an object literal. */
const CATALOG_CALL = /\blocalized?\s*(?:<[^(]*?>)?\s*\(\s*\{/g;
/** A property's name and colon, from where the previous property ended. */
const PROPERTY = /^\s*([A-Za-z_$][\w$]*)\s*:/;
const OPENING = "([{";
const CLOSING = ")]}";

/** Where the value starting at `from` ends: at a `,` or a closing bracket of its own level. */
function valueEnd(code, from) {
  let depth = 0;
  for (let at = from; at < code.length; at++) {
    const char = code[at];
    if (OPENING.includes(char)) {
      depth += 1;
    } else if (CLOSING.includes(char)) {
      if (depth === 0) return at;
      depth -= 1;
    } else if (char === "," && depth === 0) {
      return at;
    }
  }
  return code.length;
}

/** The blocks of the catalog whose object literal starts at `from`, just past its `{`. */
function blocksFrom(code, from) {
  const blocks = [];
  let at = from;
  while (at < code.length) {
    const property = code.slice(at).match(PROPERTY);
    if (!property) break;
    const start = at + property[0].length;
    const end = valueEnd(code, start);
    blocks.push({ language: property[1], start, end });
    if (code[end] !== ",") break;
    at = end + 1;
  }
  return blocks;
}

/**
 * Splits a source by language: the text of each language's blocks, and the
 * source with all of them blanked out.
 *
 * @param {string} source
 * @returns {SplitSource}
 */
export function splitByLanguage(source) {
  const text = source.replaceAll("\r\n", "\n");
  const code = tsCode(text);
  const blocks = [...code.matchAll(CATALOG_CALL)].flatMap((call) =>
    blocksFrom(code, call.index + call[0].length),
  );
  const byLanguage = new Map();
  let shared = text;
  for (const { language, start, end } of blocks) {
    byLanguage.set(language, [...(byLanguage.get(language) ?? []), text.slice(start, end)]);
    shared = shared.slice(0, start) + " ".repeat(end - start) + shared.slice(end);
  }
  return { shared, byLanguage };
}
