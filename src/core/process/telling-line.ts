import { stripVTControlCharacters } from "node:util";

/**
 * The line of a command's output that says what happened, for a summary that
 * has room for one: the first line that opens on an error marker, else the
 * last line, where most tools end on their reason. The last line alone is
 * often not the cause — Homebrew ends on "You should download the Command
 * Line Tools for Xcode 27.0.", nine lines after the `Error:` that says why.
 */

/**
 * `Error: …` (Homebrew, pip, choco), `error: …` and `error[E0425]: …` (cargo),
 * `fatal: …` (git).
 */
const LEADING_MARKER = /^(?:error|fatal)\b/i;
/** A tool's name, then its marker: `npm error …`, `npm ERR! …`. */
const TOOL_MARKER = /^[a-z][\w.-]* (?:error\b|ERR!)/;
/** apt's `E: …`. */
const APT_MARKER = /^E: /;

const ERROR_MARKERS: readonly RegExp[] = [LEADING_MARKER, TOOL_MARKER, APT_MARKER];

/** CRLF, LF and lone CR all end a line: progress bars redraw with a bare CR. */
const LINE_BREAK = /\r\n|\r|\n/;
/** C0 and C1 controls, tabs included, once escape sequences are gone. */
// eslint-disable-next-line no-control-regex -- matching control characters is the point
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f]+/g;

/** A message is one line of a summary: a longer line is cut, an ellipsis at its end. */
const MAX_LENGTH = 240;
const ELLIPSIS = "…";

/** The telling line of `output`, escapes and controls removed; undefined when it holds no text. */
export function tellingLine(output: string): string | undefined {
  const lines = stripVTControlCharacters(output)
    .split(LINE_BREAK)
    .map((line) => line.replace(CONTROL_CHARACTERS, " ").trim())
    .filter(Boolean);
  const line = lines.find(opensOnErrorMarker) ?? lines.at(-1);
  return line === undefined ? undefined : clipped(line);
}

function opensOnErrorMarker(line: string): boolean {
  return ERROR_MARKERS.some((marker) => marker.test(line));
}

function clipped(line: string): string {
  if (line.length <= MAX_LENGTH) return line;
  return `${line.slice(0, MAX_LENGTH - ELLIPSIS.length).trimEnd()}${ELLIPSIS}`;
}
