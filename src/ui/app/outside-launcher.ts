import type { SelectedPackage } from "../../core/types.js";
import { CONFIRM_UPDATE } from "../text/menu-labels.js";
import type { DialogLayer } from "../tui/dialog.js";
import type { LauncherFactory } from "./update-launcher.js";

/** Packages listed by name in the confirmation; the rest are counted. */
const LISTED_PACKAGES = 8;

/**
 * Updates on the plain terminal. Installers print progress, ask questions and
 * sometimes open UAC prompts; they need a real terminal, and a screen holding
 * the keyboard in raw mode would fight them for it. So, once confirmed (when
 * the preferences ask for it), the session ends and the app runs the update
 * after the screen is gone; the launch itself never has a report to give.
 */
export const outsideLauncher: LauncherFactory = (context) => ({
  isRunning: false,
  async launch(packages, request = {}) {
    if (packages.length === 0 || context.isScanning()) return null;
    const mustConfirm = context.preferences().confirmBeforeUpdate;
    if (mustConfirm && !(await confirmUpdate(context.dialogs, packages))) return null;
    context.exit({
      kind: "outside",
      run: () => context.controller.updateOutside(packages, request),
      ...(request.returnTo !== undefined && { returnTo: request.returnTo }),
    });
    return null;
  },
});

function confirmUpdate(dialogs: DialogLayer, packages: readonly SelectedPackage[]) {
  const listed = packages.slice(0, LISTED_PACKAGES).map(({ pkg }) => CONFIRM_UPDATE.item(pkg));
  const hidden = packages.length - listed.length;
  return dialogs.confirm({
    title: CONFIRM_UPDATE.title,
    text: [
      CONFIRM_UPDATE.heading(packages.length),
      "",
      ...listed,
      ...(hidden > 0 ? [CONFIRM_UPDATE.more(hidden)] : []),
    ],
  });
}
