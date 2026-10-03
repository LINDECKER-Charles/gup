import { lookupProvider } from "../core/platform/lookup-provider.js";
import { ALL_PROVIDERS, detectAvailableProviders, getProvider } from "../core/registry.js";
import type { Provider } from "../core/types.js";
import { requestsFrom } from "../core/update/update-plan.js";
import type { UpdateRequest } from "../core/update/update-ports.js";
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

  async updateTargets(targets) {
    await runWithConsole(targets.flatMap((target) => requestOf(target) ?? []));
  },

  validateTargets(raw) {
    const targets = raw.split(/[\s,]+/).filter(Boolean);
    if (targets.length === 0) return "saisir au moins une cible";
    const invalid = targets.find((target) => {
      const request = requestOf(target);
      return !request || !lookupProvider(request.providerId).isFound;
    });
    return invalid ? `cible invalide : ${invalid} (format provider:package)` : true;
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

/** `provider:packageId` (the first colon splits), or null when either half is missing. */
function requestOf(target: string): UpdateRequest | null {
  const idx = target.indexOf(":");
  if (idx <= 0 || idx === target.length - 1) return null;
  return { providerId: target.slice(0, idx), packageId: target.slice(idx + 1) };
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
