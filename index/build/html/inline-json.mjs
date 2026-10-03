/**
 * Serialises a value for an inline `<script type="application/…json">` block.
 *
 * JSON.stringify alone is not enough inside HTML: a string containing
 * `</script>` closes the element early, `<!--` changes the tokenizer state,
 * and U+2028/U+2029 used to be line terminators in JavaScript. All five
 * characters are emitted as \u escapes, which every JSON parser reads back
 * unchanged.
 */
const UNSAFE = /[<>&\p{Zl}\p{Zp}]/gu;

const toEscape = (char) => `\\u${char.codePointAt(0).toString(16).padStart(4, "0")}`;

/** @param {unknown} value */
export function inlineJson(value) {
  return JSON.stringify(value).replace(UNSAFE, toEscape);
}
