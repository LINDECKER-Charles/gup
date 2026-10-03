import { VIEW_LABELS } from "../../../src/ui/text/menu-labels.js";
import { appFixture } from "../fixtures/app-fixture.js";
import type { Scene } from "./scene.js";
import { SCENE_SIZES } from "./sizes.js";

/** What every scene but the held scan waits for: the scan is over, Paquets is in front. */
const SCAN_DONE = "Visual Studio Code";

function times(count: number, key: string): string[] {
  return Array.from({ length: count }, () => key);
}

/**
 * Bring a view to the front from the sidebar: Tab gives it the keyboard on
 * Paquets, each step down shows the next entry, Entrée hands the keyboard to
 * the view.
 */
function viaSidebar(stepsBelowPackages: number): string[] {
  return ["tab", ...times(stepsBelowPackages, "down"), "enter"];
}

/**
 * The views the menu has had since 0.4.0: Scan, Paquets, Providers, Options.
 * Package rows sort by provider name (Cargo, Chocolatey, npm, pipx, Scoop,
 * Winget), so the Winget group is row 13 and `pnpm` row 7.
 */
export const CORE_SCENES: readonly Scene[] = [
  {
    id: "scan-progress",
    title: `gup — ${VIEW_LABELS.scan}`,
    alt:
      "Scan view mid-scan: 9 of 14 providers done, two still running, Scoop failed, " +
      "the others show how many updates they found.",
    size: SCENE_SIZES.default,
    fixture: () => appFixture({ holdScan: { finished: 9, running: 2 } }),
    play: (stage) => stage.waitForText("scan 9/14"),
  },
  {
    id: "packages-select",
    title: `gup — ${VIEW_LABELS.packages}`,
    alt:
      "The Paquets view: 12 outdated packages grouped by provider, Winget fully checked, " +
      "npm partly checked, a failed Scoop scan shown inline, key hints at the bottom.",
    size: SCENE_SIZES.default,
    fixture: () => appFixture(),
    play: async (stage) => {
      await stage.waitForText(SCAN_DONE);
      await stage.press(...times(13, "down"), "space", ...times(6, "up"), "space");
      await stage.press(...times(3, "down"));
      await stage.waitForText("entrée mettre à jour (5)");
    },
  },
  {
    id: "providers",
    title: `gup — ${VIEW_LABELS.providers}`,
    alt:
      "Providers view: the 14 providers detected on the machine, then the ones not " +
      "installed, each with the command that installs it.",
    size: SCENE_SIZES.default,
    fixture: () => appFixture(),
    play: async (stage) => {
      await stage.waitForText(SCAN_DONE);
      await stage.press(...viaSidebar(1));
      await stage.waitForText("Non installés");
    },
  },
  {
    id: "options",
    title: `gup — ${VIEW_LABELS.options}`,
    alt: "Options view: fast mode, install timeout and provider filter, each with what it changes.",
    size: SCENE_SIZES.default,
    fixture: () => appFixture(),
    play: async (stage) => {
      await stage.waitForText(SCAN_DONE);
      await stage.press(...viaSidebar(2));
      await stage.waitForText("Mode rapide");
    },
  },
];
