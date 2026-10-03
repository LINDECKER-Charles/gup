import type { KeyEvent } from "@opentui/core";
import type { ProviderScanResult, SelectedPackage } from "../../core/types.js";
import { PackageList } from "../panels/package-list.js";
import { PackagesPanel } from "../panels/packages-panel.js";
import { bodyPanelSize, Chrome } from "../tui/chrome.js";
import { screenHost, type Screen, type ScreenHost } from "../tui/screen-host.js";
import { TextPanel } from "../tui/text-panel.js";
import { printAnswer } from "./dialog-screen.js";

/**
 * The menu's package table on its own screen, for `gup update` without
 * targets: check packages (or Enter on one, or on a provider) to pick them,
 * `q` to leave without picking anything.
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
  printAnswer("Paquets à mettre à jour", `${picked.length} sélectionné(s)`);
  return picked;
}

function mountPicker(
  screen: Screen,
  list: PackageList,
  resolve: (picked: SelectedPackage[]) => void,
): void {
  const chrome = new Chrome(screen);
  const view = new TextPanel(screen, chrome.body, { id: "gup-packages", title: "Paquets" });
  const packages = new PackagesPanel({ onLaunch: resolve });
  packages.setList(list);
  const viewport = () => bodyPanelSize(screen);
  const draw = (): void => {
    view.show(packages.render(viewport()));
    chrome.setHints(`${packages.hints()} · q annuler`);
  };
  screen.renderer.keyInput.on("keypress", (key: KeyEvent) => {
    if (!packages.isCapturingText && key.name === "q") return resolve([]);
    packages.press(key);
    draw();
  });
  view.onRowClick((row) => (packages.click(row, viewport()), draw()));
  view.onScroll((step) => (packages.scroll(step), draw()));
  draw();
}
