import { getProvider } from "../core/registry.js";
import { requestsFrom } from "../core/update/update-plan.js";
import { MenuApp } from "../ui/app/menu-app.js";
import type { MenuController } from "../ui/app/menu-session.js";
import { runScan } from "../ui/scan-progress.js";
import { MODULE_ORDER, type CliModule } from "./cli/cli-module.js";
import type { MenuState } from "./menu-state.js";
import { menuViews } from "./menu-views.js";
import { runWithConsole } from "./update.js";

/** `gup` with no subcommand: the full-screen interactive app. */
export async function menuCommand(): Promise<number> {
  const state: MenuState = {
    scans: [],
    fast: false,
    filter: [],
    detectedCount: 0,
    providers: [],
  };
  await new MenuApp({ controller: menuController, state, views: menuViews() }).run();
  return 0;
}

/**
 * What the app needs from gup's core: scanning and updates.
 * Updates run on the plain terminal through the same pipeline and console
 * output as `gup update`: packages that need administrator rights go to one
 * elevated batch behind a single UAC / sudo prompt.
 */
export const menuController: MenuController = {
  async scan(state, events) {
    const run = await runScan(
      { fast: state.fast, ...(state.filter.length > 0 && { only: state.filter }) },
      events,
    );
    state.scans = run.results;
    state.detectedCount = run.detected.length;
    state.providers = run.detected.map((p) => ({ id: p.id, displayName: p.displayName }));
  },

  async updatePackages(packages) {
    await runWithConsole(requestsFrom(packages));
  },

  displayName(providerId) {
    return getProvider(providerId)?.displayName ?? providerId;
  },
};

/** `gup` alone opens the menu: the program's own action. */
export const menuModule: CliModule = {
  id: "menu",
  order: MODULE_ORDER.commands,
  register(program) {
    program.action(async () => {
      const code = await menuCommand();
      process.exit(code);
    });
  },
};
