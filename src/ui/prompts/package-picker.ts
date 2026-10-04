import type { KeyEvent } from "@opentui/core";
import type { ProviderScanResult, SelectedPackage } from "../../core/types.js";
import { PackageList } from "../panels/package-list.js";
import { PackagesPanel } from "../panels/packages-panel.js";
import { VIEW_LABELS } from "../text/menu-labels.js";
import { PICKER_LABELS } from "../text/packages-labels.js";
import { bodyPanelSize, Chrome } from "../tui/chrome.js";
import { screenHost, type Screen, type ScreenHost } from "../tui/screen-host.js";
import { TextPanel } from "../tui/text-panel.js";
import { printAnswer } from "./dialog-screen.js";

/**
 * The menu's package table on its own screen, for `gup update` without
 * targets, with the same rules: check packages (Space, a click, `a` for
 * everything shown), then Entrée — or a click on the selection bar — picks
 * the checked ones; with nothing checked it explains instead. `q` leaves
 * without picking anything.
 */
export async function pickPackages(
  scans: readonly ProviderScanResult[],
  nameOf: (providerId: string) => string,
  host: ScreenHost = screenHost,
): Promise<SelectedPackage[]> {
  const list = new PackageList(scans, nameOf);
  const picked = await host.run(
    (screen) => new Promise<SelectedPackage[]>((resolve) => mountPicker(screen, list, resolve)),
  );
  printAnswer(PICKER_LABELS.answerTitle, PICKER_LABELS.answer(picked.length));
  return picked;
}

function mountPicker(
  screen: Screen,
  list: PackageList,
  resolve: (picked: SelectedPackage[]) => void,
): void {
  const chrome = new Chrome(screen);
  const view = new TextPanel(screen, chrome.body, {
    id: "gup-packages",
    title: VIEW_LABELS.packages,
  });
  const packages = new PackagesPanel({ onLaunch: resolve });
  packages.setList(list);
  const viewport = () => bodyPanelSize(screen);
  const draw = (): void => {
    view.show(packages.render(viewport()));
    chrome.setHints(packages.hints(), PICKER_LABELS.cancelHint);
  };
  screen.renderer.keyInput.on("keypress", (key: KeyEvent) => {
    if (!packages.isCapturingText && key.name === "q") return resolve([]);
    packages.press(key);
    draw();
  });
  view.onRowClick((row) => (packages.click(row, viewport()), draw()));
  view.onScroll((step) => (packages.scroll(step), draw()));
  // The selection bar sits on the last row: follow the terminal's height.
  screen.renderer.on("resize", draw);
  draw();
}
