import chalk from "chalk";
import { applyPersistedInstallTimeout } from "../../core/config/install-section.js";
import { configStore, type ConfigStore } from "../../core/config/store.js";
import { installConsole } from "../../core/process/output-router.js";
import { getProvider } from "../../core/registry.js";
import { setUiPreferencesSource } from "../../ui/app/ui-preferences.js";
import { describeConfigStatus } from "../../ui/settings/config-status.js";
import { SettingsService } from "../../ui/settings/settings-service.js";
import { appearanceSource, menuPreferencesSource } from "../../ui/settings/settings-sources.js";
import { isNoColor } from "../../ui/theme/resolve-theme.js";
import { themedAppearance } from "../../ui/theme/runtime/themed-appearance.js";
import { configureScreens } from "../../ui/tui/screen-host.js";
import {
  CONFIG_DIAGNOSTIC_LABEL,
  startupIssueLine,
  unknownProviderIssue,
} from "../../ui/text/settings-labels.js";
import { MODULE_ORDER, type CliModule, type DiagnosticLine } from "./cli-module.js";

/**
 * The user's settings, wired in before any command runs:
 *
 * - `NO_COLOR` turns chalk's colours off (chalk only honours FORCE_COLOR);
 *   the screens go monochrome through the theme engine;
 * - the persisted install timeout applies to every command (flag > env >
 *   file > default);
 * - the screens get the theme engine and the mouse preference, the menu its
 *   preferences;
 * - problems with the file are printed once, before any screen opens — the
 *   store itself never prints.
 *
 * Never in the elevated child: a user-writable file must not steer an
 * administrator process (the module does not opt in).
 */

export interface SettingsModuleDeps {
  readonly store: () => ConfigStore;
  readonly env: NodeJS.ProcessEnv;
  readonly isKnownProvider: (providerId: string) => boolean;
}

const DEFAULT_DEPS: SettingsModuleDeps = {
  store: configStore,
  env: process.env,
  isKnownProvider: (providerId) => getProvider(providerId) !== undefined,
};

export function createSettingsModule(deps: SettingsModuleDeps = DEFAULT_DEPS): CliModule {
  return {
    id: "settings",
    order: MODULE_ORDER.settings,
    beforeAction: () => installSettings(deps),
    diagnostics: async () => [configDiagnostic(deps)],
  };
}

export const settingsModule = createSettingsModule();

function installSettings(deps: SettingsModuleDeps): void {
  if (isNoColor(deps.env)) chalk.level = 0;
  const store = deps.store();
  const settings = new SettingsService(store);
  applyPersistedInstallTimeout(store, deps.env);
  reportProblems(settings, deps.isKnownProvider);
  configureScreens({
    createAppearance: themedAppearance(appearanceSource(settings)),
    rendererOptions: () => ({ useMouse: settings.get("interface").mouse }),
  });
  setUiPreferencesSource(menuPreferencesSource(settings, deps.isKnownProvider));
}

function reportProblems(
  settings: SettingsService,
  isKnownProvider: (providerId: string) => boolean,
): void {
  const unknown = settings
    .get("scan")
    .providerFilter.filter((providerId) => !isKnownProvider(providerId))
    .map(unknownProviderIssue);
  for (const issue of [...settings.status().issues, ...unknown]) {
    installConsole.warn(startupIssueLine(issue));
  }
}

function configDiagnostic(deps: SettingsModuleDeps): DiagnosticLine {
  const status = new SettingsService(deps.store()).status();
  const { text, level } = describeConfigStatus(status);
  return {
    label: CONFIG_DIAGNOSTIC_LABEL,
    value: status.file === null ? text : `${status.file} — ${text}`,
    status: level,
  };
}
