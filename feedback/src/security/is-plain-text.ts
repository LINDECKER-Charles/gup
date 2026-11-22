/** The first code point that is not a C0 control. */
const FIRST_PRINTABLE = 0x20;
/** The C0 controls a human-typed text legitimately holds. */
const ALLOWED_CONTROLS = new Set(["\t", "\n", "\r"]);

/**
 * Whether a typed text is safe to store and show: well-formed Unicode (no
 * lone surrogate) and no C0 control character but tab and line breaks — NUL,
 * escape sequences and their kin have no business in a title or a note.
 */
export function isPlainText(text: string): boolean {
  if (!text.isWellFormed()) return false;
  for (const character of text) {
    const isControl = (character.codePointAt(0) ?? 0) < FIRST_PRINTABLE;
    if (isControl && !ALLOWED_CONTROLS.has(character)) return false;
  }
  return true;
}
