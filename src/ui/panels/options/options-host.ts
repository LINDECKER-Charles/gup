import type { ViewContext } from "../../app/view-definition.js";
import type { SettingsService } from "../../settings/settings-service.js";
import type { ThemeSettings } from "../../settings/theme-section.js";
import type { Appearance } from "../../theme/appearance.js";
import {
  isNoColor,
  resolveTheme,
  themeAvailability,
  type ResolveInput,
  type TerminalFacts,
} from "../../theme/resolve-theme.js";
import { ThemedAppearance } from "../../theme/runtime/themed-appearance.js";
import type { AppearanceControl, OptionsHost } from "./option-row.js";

/**
 * The Options view's way into the rest of gup for one menu session: the
 * settings, the theme engine painting this screen, the dialogs, the session's
 * scan state, the clipboard and the mouse.
 */

export interface OptionsHostDeps {
  readonly settings: SettingsService;
  /** Default: `process.env`. */
  readonly env?: NodeJS.ProcessEnv;
}

export function createOptionsHost(context: ViewContext, deps: OptionsHostDeps): OptionsHost {
  const { screen } = context;
  const env = deps.env ?? process.env;
  return {
    settings: deps.settings,
    appearance: appearanceControl(screen.appearance, deps.settings, env),
    state: context.state,
    dialogs: context.dialogs,
    env,
    density: () => screen.appearance.density,
    rescan: () => context.rescan(),
    copyToClipboard: (text) => screen.renderer.copyToClipboardOSC52(text),
    setMouse: (isOn) => void (screen.renderer.useMouse = isOn),
    redraw: () => context.redraw(),
  };
}

/** True while the screen paints a theme that is not saved. */
export function isPreviewShown(appearance: Appearance): boolean {
  return appearance instanceof ThemedAppearance && appearance.isPreviewing;
}

/**
 * The theme engine painting this screen. When the screen is not painted by
 * it (its factory failed and the screen fell back to the legacy look), the
 * themes are still listed and saved, resolved as on a terminal that was
 * never asked for its colours; nothing is previewed on screen then.
 */
export function appearanceControl(
  appearance: Appearance,
  settings: SettingsService,
  env: NodeJS.ProcessEnv,
): AppearanceControl {
  if (!(appearance instanceof ThemedAppearance)) return unpaintedControl(settings, env);
  return {
    resolved: () => appearance.resolved,
    preview: (theme) => appearance.preview(theme),
    endPreview: () => appearance.endPreview(),
    availability: () => appearance.availability(),
  };
}

const NEVER_ASKED: TerminalFacts = {
  colors: null,
  themeMode: null,
  depth: "unknown",
  detection: "done",
};

function unpaintedControl(settings: SettingsService, env: NodeJS.ProcessEnv): AppearanceControl {
  let previewed: ThemeSettings | null = null;
  const input = (theme: ThemeSettings): ResolveInput => ({
    settings: theme,
    terminal: NEVER_ASKED,
    isNoColor: isNoColor(env),
  });
  return {
    resolved: () => resolveTheme(input(previewed ?? settings.get("theme"))),
    preview: (theme) => void (previewed = theme),
    endPreview: () => void (previewed = null),
    availability: () => themeAvailability(input(settings.get("theme"))),
  };
}
