import { applyPersistedInstallTimeout } from "../../../core/config/install-section.js";
import { INTERFACE_SECTION } from "../../settings/interface-section.js";
import type { ResetScope } from "../../text/options-labels.js";
import type { OptionsHost } from "./option-row.js";

/**
 * Put a group of settings back to their defaults, the way the Options view
 * groups them: Apparence (theme, colours, contrast, symbols, density),
 * Confort (the rest of the `interface` section), Scan & installation (fast
 * mode, filter, timeout — applied to the session at once too). Every step
 * runs even when one cannot be persisted; the first failure is rethrown at
 * the end, the values staying in effect for the session.
 */
export function resetSettings(scope: ResetScope, host: OptionsHost): void {
  let failure: unknown = null;
  for (const step of stepsOf(scope, host)) {
    try {
      step();
    } catch (error) {
      failure ??= error;
    }
  }
  if (failure !== null) throw failure;
}

/** True when the reset changes what a scan finds. */
export function touchesScan(scope: ResetScope): boolean {
  return scope === "scan" || scope === "all";
}

type Step = () => void;

function stepsOf(scope: ResetScope, host: OptionsHost): Step[] {
  switch (scope) {
    case "appearance":
      return appearanceSteps(host);
    case "comfort":
      return comfortSteps(host);
    case "scan":
      return scanSteps(host);
    case "all":
      return [...appearanceSteps(host), ...comfortSteps(host), ...scanSteps(host)];
  }
}

const { density, glyphs, ...COMFORT_DEFAULTS } = INTERFACE_SECTION.defaults;

function appearanceSteps(host: OptionsHost): Step[] {
  return [
    () => host.settings.reset(["theme"]),
    () => host.settings.update("interface", { density, glyphs }),
  ];
}

function comfortSteps(host: OptionsHost): Step[] {
  return [
    () => host.settings.update("interface", COMFORT_DEFAULTS),
    () => host.setMouse(COMFORT_DEFAULTS.mouse),
  ];
}

function scanSteps(host: OptionsHost): Step[] {
  return [
    () => host.settings.reset(["scan", "install"]),
    () => {
      const scan = host.settings.get("scan");
      host.state.fast = scan.fast;
      host.state.filter = [...scan.providerFilter];
      applyPersistedInstallTimeout(host.settings.get("install"), host.env);
    },
  ];
}
