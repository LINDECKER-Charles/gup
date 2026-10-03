import { createInterface } from "node:readline/promises";
import chalk from "chalk";
import type { MenuState } from "../../commands/menu-state.js";
import { screenHost, type ScreenHost } from "../tui/screen-host.js";
import { MenuSession, type MenuController } from "./menu-session.js";

/**
 * gup's interactive mode: a full-screen OpenTUI app on the terminal's
 * alternate screen.
 *
 * Updates do not run inside it. Installers print progress, ask questions and
 * sometimes open UAC prompts; they need a real terminal, and a TUI holding
 * the keyboard in raw mode would fight them for it. So when an update is
 * confirmed, the session ends, the screen is torn down (the main screen comes
 * back as it was), the update runs there with its output visible, and the
 * app comes back on Enter, rescanning to show what is left.
 */
export class MenuApp {
  readonly #controller: MenuController;
  readonly #state: MenuState;
  readonly #host: ScreenHost;

  constructor(controller: MenuController, state: MenuState, host: ScreenHost = screenHost) {
    this.#controller = controller;
    this.#state = state;
    this.#host = host;
  }

  async run(): Promise<void> {
    for (;;) {
      const exit = await this.#host.run((screen) =>
        new MenuSession(screen, {
          state: this.#state,
          controller: this.#controller,
          scanOnStart: true,
        }).run(),
      );
      if (exit.kind === "quit") return;
      await exit.run();
      await waitForEnter();
    }
  }
}

/** Keep the install output on screen until the user has read it. */
async function waitForEnter(): Promise<void> {
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  try {
    await prompt.question(chalk.dim("\n  Entrée pour revenir à gup… "));
  } finally {
    prompt.close();
  }
}
