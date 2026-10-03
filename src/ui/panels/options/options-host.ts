import type { ViewContext } from "../../app/view-definition.js";
import type { SettingsService } from "../../settings/settings-service.js";
import type { OptionsHost } from "./option-row.js";

/**
 * The Options view's way into the rest of gup for one menu session: the
 * settings, the dialogs, the session's scan state, the clipboard and the
 * mouse.
 */

export interface OptionsHostDeps {
  readonly settings: SettingsService;
  /** Default: `process.env`. */
  readonly env?: NodeJS.ProcessEnv;
}

export function createOptionsHost(context: ViewContext, deps: OptionsHostDeps): OptionsHost {
  const { screen } = context;
  return {
    settings: deps.settings,
    state: context.state,
    dialogs: context.dialogs,
    env: deps.env ?? process.env,
    density: () => screen.appearance.density,
    rescan: () => context.rescan(),
    copyToClipboard: (text) => screen.renderer.copyToClipboardOSC52(text),
    setMouse: (isOn) => void (screen.renderer.useMouse = isOn),
    redraw: () => context.redraw(),
  };
}
