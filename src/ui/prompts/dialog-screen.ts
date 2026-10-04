import type { KeyEvent } from "@opentui/core";
import chalk from "chalk";
import { Chrome } from "../tui/chrome.js";
import { DialogLayer } from "../tui/dialog.js";
import { screenHost, type ScreenHost } from "../tui/screen-host.js";

/**
 * A dialog on its own screen, for the one-shot commands that need a single
 * answer outside the menu (a confirmation, a retry strategy).
 */
export function withDialog<T>(
  open: (dialogs: DialogLayer) => Promise<T>,
  host: ScreenHost = screenHost,
): Promise<T> {
  return host.run((screen) => {
    const chrome = new Chrome(screen);
    const dialogs = new DialogLayer(screen);
    dialogs.onChange(() => chrome.setHints(dialogs.hints()));
    screen.renderer.keyInput.on("keypress", (key: KeyEvent) => dialogs.press(key));
    return open(dialogs);
  });
}

/**
 * The line a resolved question leaves in the scrollback once its screen is
 * gone, so the session still reads as a log of what was decided.
 */
export function printAnswer(question: string, answer: string): void {
  process.stdout.write(`${chalk.green("◊")}  ${question} ${chalk.dim(`· ${answer}`)}\n`);
}
