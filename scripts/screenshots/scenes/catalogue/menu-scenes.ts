import { CONFIRM_UPDATE, VIEW_LABELS } from "../../../../src/ui/text/menu-labels.js";
import { PROVIDERS_PANEL_LABELS } from "../../../../src/ui/text/providers-labels.js";
import { appFixture } from "../../fixtures/app-fixture.js";
import { FIXTURE_PLATFORM } from "../../fixtures/machine.js";
import { PROVIDERS_FIXTURE } from "../../fixtures/providers.js";
import type { SceneGroup } from "../scene.js";
import { SCENE_SIZES } from "../sizes.js";
import { checkWingetAndPnpm, launchSix, SCAN_DONE } from "./package-plays.js";

/** Enough to scroll the Providers list to its end, whatever the height. */
const SCROLL_TO_END = Array.from({ length: 60 }, () => "down");

/** The menu's core: the scan, the package table, the update confirmation, the providers. */
export const MENU_GROUP: SceneGroup = {
  title: "Menu",
  scenes: [
    {
      id: "scan-progress",
      get title() {
        return `gup — ${VIEW_LABELS.scan}`;
      },
      alt:
        "Scan view mid-scan: 9 of 14 providers done, two still running, Scoop failed, " +
        "the others show how many updates they found.",
      size: SCENE_SIZES.default,
      fixture: () => appFixture({ holdScan: { finished: 9, running: 2 } }),
      play: (stage) => stage.waitForText("scan 9/14"),
    },
    {
      id: "packages-select",
      get title() {
        return `gup — ${VIEW_LABELS.packages}`;
      },
      alt:
        "The Packages view: 12 outdated packages grouped by provider, Winget fully checked, " +
        "npm partly checked, scheduled packages marked, a failed Scoop scan shown inline, " +
        "the selection bar and its update button at the bottom.",
      size: SCENE_SIZES.default,
      fixture: () => appFixture(),
      play: checkWingetAndPnpm,
    },
    {
      id: "confirm-update",
      get title() {
        return `gup — ${CONFIRM_UPDATE.title}`;
      },
      alt:
        "Update confirmation listing the six checked packages with their current and target " +
        "versions, one tagged admin, and the note that a single UAC prompt comes at the end.",
      size: SCENE_SIZES.default,
      fixture: () => appFixture(),
      play: launchSix,
    },
    {
      id: "providers-os",
      get title() {
        return `gup — ${VIEW_LABELS.providers}`;
      },
      alt:
        "Providers view on Windows, scrolled down: providers not installed with the command " +
        "that installs each, then the macOS and Linux providers greyed out as incompatible.",
      size: SCENE_SIZES.default,
      fixture: () => appFixture(),
      play: async (stage) => {
        await stage.waitForText(SCAN_DONE);
        await stage.open("providers");
        await stage.waitForText(PROVIDERS_PANEL_LABELS.detected(PROVIDERS_FIXTURE.detected.length));
        await stage.press(...SCROLL_TO_END);
        const { length } = PROVIDERS_FIXTURE.incompatible;
        await stage.waitForText(PROVIDERS_PANEL_LABELS.incompatible(FIXTURE_PLATFORM, length));
      },
    },
  ],
};
