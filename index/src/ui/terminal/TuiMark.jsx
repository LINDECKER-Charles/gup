/**
 * A mark the TUI draws (a status glyph, a checkbox), with the word a screen
 * reader says instead, in the scene's language: the glyph alone reads as
 * noise or nothing.
 *
 * @param {{ glyph: string, word: string, className?: string }} props
 */
export function TuiMark({ glyph, word, className }) {
  return (
    <span className={className}>
      <span aria-hidden="true">{glyph}</span>
      <span className="sr-only">{word}</span>
    </span>
  );
}
