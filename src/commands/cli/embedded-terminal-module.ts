import { PTY_LABELS } from "../../core/pty/pty-labels.js";
import { loadEmbeddedTerminal, type EmbeddedTerminalSupport } from "../../core/pty/pty-loader.js";
import { inScreenLauncher } from "../../ui/app/in-screen-launcher.js";
import { setLauncherFactory } from "../../ui/app/update-launcher.js";
import { TERMINAL_DIAGNOSTIC } from "../../ui/text/run-labels.js";
import { MODULE_ORDER, type CliModule, type DiagnosticLine } from "./cli-module.js";

/** `gup` alone: the interactive menu. */
const MENU_COMMAND_PATH = "";

/**
 * Updates inside the full-screen app: for the menu, installs the launcher
 * that runs them in the run view's embedded terminal (falling back to the
 * plain terminal when it is unavailable), and tells `gup doctor` whether the
 * embedded terminal works here — or why not, the macOS `spawn-helper` path
 * included.
 */
export const embeddedTerminalModule: CliModule = {
  id: "embedded-terminal",
  // Reads no other module's slot when installed: the launcher looks at the
  // preferences and the terminal only when the user launches an update.
  order: MODULE_ORDER.commands,
  beforeAction({ commandPath }) {
    if (commandPath === MENU_COMMAND_PATH) setLauncherFactory(inScreenLauncher());
  },
  async diagnostics() {
    return [terminalDiagnostic(await loadEmbeddedTerminal())];
  },
};

/** Available, turned off by the user (`GUP_PTY`), or unavailable with the reason. */
function terminalDiagnostic(support: EmbeddedTerminalSupport): DiagnosticLine {
  const label = TERMINAL_DIAGNOSTIC.label;
  if (support.isAvailable) return { label, value: TERMINAL_DIAGNOSTIC.available, status: "ok" };
  const status = support.reason === PTY_LABELS.disabled ? "off" : "warn";
  return { label, value: TERMINAL_DIAGNOSTIC.unavailable(support.reason), status };
}
