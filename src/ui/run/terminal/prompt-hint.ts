/**
 * Whether the installer in the terminal pane is probably waiting for the
 * user: it has been silent for a while, and the line under the cursor reads
 * like a question. gup only says so (a hint row); it never types an answer
 * and never takes the keyboard by itself.
 */

/** Silence after which a prompt-looking line counts as a question (exported for the tests). */
export const PROMPT_IDLE_MS = 2_500;

export interface PromptSample {
  /** The pane's line under the cursor. */
  readonly lastLine: string;
  /** Milliseconds since the installer last wrote anything. */
  readonly idleMs: number;
}

/** `Password:`, `Continue? `, `PS C:\> `, `[Y/n]`, `(o/n)`… */
const PROMPT_ENDING = /[:?>\]]\s*$/;
const YES_NO = /[[(]\s*[yo]\s*\/\s*n\s*[\])]/i;
const SECRET = /password|mot de passe|passphrase/i;

export function isLikelyAwaitingInput(sample: PromptSample): boolean {
  if (sample.idleMs < PROMPT_IDLE_MS) return false;
  const line = sample.lastLine.trimEnd();
  if (line.length === 0) return false;
  return PROMPT_ENDING.test(line) || YES_NO.test(line) || SECRET.test(line);
}
