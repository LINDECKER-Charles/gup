import { ALL_PROVIDERS, detectAvailableProviders, getProvider } from "../core/registry.js";
import type { Provider } from "../core/types.js";
import { requestsFrom } from "../core/update/update-plan.js";
import { MenuApp } from "../ui/app/menu-app.js";
import type { MenuController } from "../ui/app/menu-session.js";
import { runScan } from "../ui/scan-progress.js";
import { MODULE_ORDER, type CliModule } from "./cli/cli-module.js";
import type { MenuState } from "./menu-state.js";
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
  await new MenuApp(menuController, state).run();
  return 0;
}

/**
 * What the app needs from gup's core: scanning, provider status, updates.
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

  async providersStatus() {
    const detected = await detectAvailableProviders();
    const ids = new Set(detected.map((p) => p.id));
    return {
      detected: detected.map(info),
      missing: ALL_PROVIDERS.filter((p) => !ids.has(p.id)).map(info),
    };
  },

  async updatePackages(packages) {
    await runWithConsole(requestsFrom(packages));
  },

  displayName(providerId) {
    return getProvider(providerId)?.displayName ?? providerId;
  },
};

function info(p: Provider) {
  return {
    id: p.id,
    displayName: p.displayName,
    ...(p.installHint && { installHint: p.installHint }),
  };
}

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
