import type { DialogChoice } from "../tui/dialog.js";
import type { ScreenHost } from "../tui/screen-host.js";
import { printAnswer, withDialog } from "./dialog-screen.js";

export interface SelectOptions<T> {
  readonly message: string;
  readonly choices: readonly DialogChoice<T>[];
  /** Highlighted first, and the answer when the dialog is dismissed with Escape. */
  readonly default?: T;
}

/** One choice in a list, on its own screen. Resolves with the chosen value. */
export async function select<T>(options: SelectOptions<T>, host?: ScreenHost): Promise<T> {
  const { message, choices } = options;
  const fallback = options.default ?? choices[0]?.value;
  if (fallback === undefined) throw new Error(`select: aucun choix pour « ${message} »`);
  const picked = await withDialog(
    (dialogs) => dialogs.choose({ title: message, choices, default: fallback }),
    host,
  );
  const value = picked === undefined ? fallback : picked;
  printAnswer(message, choices.find((c) => c.value === value)?.label ?? String(value));
  return value;
}
