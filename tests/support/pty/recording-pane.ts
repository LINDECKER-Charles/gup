import type { PtyInput, PtyPane } from "../../../src/core/pty/pty-sink.js";

/**
 * A terminal pane that records instead of rendering: what the child wrote,
 * gup's notes, and the keyboard the sink attached — so a test can type into
 * the child as a user in typing mode would.
 */
export interface RecordingPane extends PtyPane {
  readonly output: string[];
  readonly notes: string[];
  readonly inputs: PtyInput[];
  /** How many times an attached keyboard was given back. */
  readonly detaches: number;
  /** Everything the child wrote, as one string (VT sequences included). */
  text(): string;
  /** Type into the child attached last. */
  type(data: string): void;
}

export interface RecordingPaneOptions {
  readonly tail?: string;
  readonly cols?: number;
  readonly rows?: number;
}

const DEFAULT_COLS = 100;
const DEFAULT_ROWS = 20;

export function recordingPane(options: RecordingPaneOptions = {}): RecordingPane {
  let detaches = 0;
  const output: string[] = [];
  const notes: string[] = [];
  const inputs: PtyInput[] = [];
  return {
    output,
    notes,
    inputs,
    get detaches() {
      return detaches;
    },
    size: () => ({ cols: options.cols ?? DEFAULT_COLS, rows: options.rows ?? DEFAULT_ROWS }),
    write(data) {
      output.push(data);
    },
    note(line) {
      notes.push(line);
    },
    attach(input) {
      inputs.push(input);
      return () => void detaches++;
    },
    tail: () => options.tail ?? "",
    text: () => output.join(""),
    type(data) {
      const input = inputs.at(-1);
      if (!input) throw new Error("recording pane: no child is attached");
      input.write(data);
    },
  };
}
