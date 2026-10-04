import { localized } from "../i18n/localized.js";

/**
 * Turns a child's output chunks into whole lines for a log, within a byte
 * budget: an installer that prints megabytes of progress must not fill the
 * disk. Pure: no I/O, the caller decides where lines go.
 */

export const OUTPUT_LABELS = localized({
  en: {
    /** The single line emitted when the budget runs out; everything after it is dropped. */
    truncated: "… output truncated",
  },
  fr: {
    truncated: "… sortie tronquée",
  },
});

export interface LineSplitterOptions {
  /** UTF-8 bytes the emitted lines may use, line breaks included. */
  readonly capBytes: number;
  readonly onLine: (line: string) => void;
}

/**
 * CRLF, LF and lone CR all end a line: progress bars redraw with a bare CR,
 * and each redraw is a state worth one log line. Blank lines are dropped.
 */
const LINE_BREAK = /\r\n|\r|\n/;
const LINE_BREAK_BYTES = 1;

export class LineSplitter {
  readonly #options: LineSplitterOptions;
  #pending = "";
  #usedBytes = 0;
  #isTruncated = false;

  constructor(options: LineSplitterOptions) {
    this.#options = options;
  }

  /** Feed a chunk; every line it completes is emitted. */
  push(chunk: string): void {
    if (this.#isTruncated) return;
    const parts = (this.#pending + chunk).split(LINE_BREAK);
    this.#pending = parts.pop() ?? "";
    for (const line of parts) this.#emit(line);
    // A line that never ends must not grow without bound either.
    if (Buffer.byteLength(this.#pending) > this.#options.capBytes) {
      this.#emit(this.#pending);
      this.#pending = "";
    }
  }

  /** The stream ended: emit the last, unterminated line. */
  end(): void {
    if (!this.#isTruncated) this.#emit(this.#pending);
    this.#pending = "";
  }

  #emit(line: string): void {
    if (this.#isTruncated || line.trim() === "") return;
    const cost = Buffer.byteLength(line) + LINE_BREAK_BYTES;
    if (this.#usedBytes + cost > this.#options.capBytes) {
      this.#isTruncated = true;
      this.#options.onLine(OUTPUT_LABELS.truncated);
      return;
    }
    this.#usedBytes += cost;
    this.#options.onLine(line);
  }
}
