import { createInterface } from "node:readline/promises";
import chalk from "chalk";
import { withoutUpdated, type MenuState } from "../../commands/menu-state.js";
import type { UpdateReport } from "../../core/update/update-report.js";
import { screenHost, type ScreenHost } from "../tui/screen-host.js";
import { MenuSession, type MenuController } from "./session/menu-session.js";
import { uiPreferences } from "./ui-preferences.js";
import type { ViewDefinition, ViewId } from "./view-definition.js";

export interface MenuAppDeps {
  readonly controller: MenuController;
  readonly state: MenuState;
  readonly views: readonly ViewDefinition[];
}

/** What the app runs on: full screens, and the plain terminal between them. */
export interface MenuAppTerminal {
  readonly host: ScreenHost;
  /** After an update on the plain terminal: wait until its output has been read. */
  pause(): Promise<void>;
}

interface SessionStart {
  readonly scanOnStart: boolean;
  readonly initialView: ViewId;
}

/**
 * gup's interactive mode: a full-screen OpenTUI app on the terminal's
 * alternate screen, as a loop of sessions.
 *
 * The first session opens on the preferred view and scans if the user wants
 * that at launch. When an update must run on the plain terminal (the outside
 * launcher), the session ends, the screen is torn down (the main screen comes
 * back as it was), the update runs there with its output visible, and the
 * app comes back on Enter: rescanning, or with the updated packages dropped,
 * as the preferences say.
 */
export class MenuApp {
  readonly #deps: MenuAppDeps;
  readonly #terminal: MenuAppTerminal;

  constructor(deps: MenuAppDeps, terminal: MenuAppTerminal = REAL_TERMINAL) {
    this.#deps = deps;
    this.#terminal = terminal;
  }

  async run(): Promise<void> {
    const { scanOnLaunch, launchView } = uiPreferences().current();
    let start: SessionStart = { scanOnStart: scanOnLaunch, initialView: launchView };
    for (;;) {
      const exit = await this.#terminal.host.run((screen) =>
        new MenuSession(screen, { ...this.#deps, ...start }).run(),
      );
      if (exit.kind === "quit") return;
      const report = await exit.run();
      await this.#terminal.pause();
      start = this.afterOutsideUpdate(report, exit.returnTo);
    }
  }

  /** Rescan with the Scan view in front, or drop what was updated and go back. */
  private afterOutsideUpdate(report: UpdateReport, returnTo: ViewId | undefined): SessionStart {
    if (uiPreferences().current().rescanAfterUpdate) {
      return { scanOnStart: true, initialView: returnTo ?? "scan" };
    }
    const { state } = this.#deps;
    state.scans = withoutUpdated(state.scans, report);
    return { scanOnStart: false, initialView: returnTo ?? "packages" };
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

const REAL_TERMINAL: MenuAppTerminal = { host: screenHost, pause: waitForEnter };
