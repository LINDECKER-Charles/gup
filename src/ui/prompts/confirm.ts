import type { ScreenHost } from "../tui/screen-host.js";
import { printAnswer, withDialog } from "./dialog-screen.js";

export interface ConfirmOptions {
  readonly message: string;
  readonly default?: boolean;
}

/**
 * Yes/no question on its own screen. `o`/`y` and `n` answer at once, Enter
 * takes the highlighted button, Escape answers no.
 */
export async function confirm(options: ConfirmOptions, host?: ScreenHost): Promise<boolean> {
  const answer = await withDialog(
    (dialogs) =>
      dialogs.confirm({
        title: "Confirmation",
        text: [options.message],
        ...(options.default !== undefined && { default: options.default }),
      }),
    host,
  );
  printAnswer(options.message, answer ? "oui" : "non");
  return answer;
}
