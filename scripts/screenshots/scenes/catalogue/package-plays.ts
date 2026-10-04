import { CONFIRM_UPDATE } from "../../../../src/ui/text/menu-labels.js";
import { SELECTION_BAR } from "../../../../src/ui/text/packages-labels.js";
import { SCAN_FIXTURE } from "../../fixtures/scan.js";
import type { Stage } from "../scene.js";

/** What shows once the scan is over, Packages in front: the last package of the table. */
export const SCAN_DONE = "Visual Studio Code";

/** The table's rows: every package the fixture scan finds outdated. */
const PACKAGE_COUNT = SCAN_FIXTURE.results.reduce(
  (count, { packages }) => count + packages.length,
  0,
);
/** Winget's four packages and pnpm. */
const README_CHECKED = 5;
/** nodejs-lts, typescript, ruff, Git, PowerToys and 7-Zip. */
const LAUNCHED = 6;

function times(count: number, key: string): string[] {
  return Array.from({ length: count }, () => key);
}

/*
 * Package rows sort by provider name, so the table of the fixture scan reads:
 * Cargo (row 0), ripgrep, bat, Chocolatey (3), nodejs-lts, npm (5),
 * typescript, pnpm, eslint, pipx (9), ruff, httpie, Scoop's failure (12),
 * Winget (13), Git, PowerToys, 7-Zip, Visual Studio Code. The cursor starts
 * on row 0.
 */

/** The README's Packages: Winget checked as a group, pnpm alone, the cursor on ruff. */
export async function checkWingetAndPnpm(stage: Stage): Promise<void> {
  await stage.waitForText(SCAN_DONE);
  await stage.press(...times(13, "down"), "space", ...times(6, "up"), "space", ...times(3, "down"));
  await stage.waitForText(SELECTION_BAR.count(README_CHECKED, PACKAGE_COUNT));
}

/**
 * The six packages the update scenes run — nodejs-lts (admin), typescript,
 * ruff, Git, PowerToys, 7-Zip — then Enter: the confirmation opens.
 */
export async function launchSix(stage: Stage): Promise<void> {
  await stage.waitForText(SCAN_DONE);
  await stage.press(...times(4, "down"), "space", ...times(2, "down"), "space");
  await stage.press(...times(4, "down"), "space", ...times(4, "down"), "space");
  await stage.press("down", "space", "down", "space");
  await stage.waitForText(SELECTION_BAR.count(LAUNCHED, PACKAGE_COUNT));
  await stage.press("enter");
  await stage.waitForText(CONFIRM_UPDATE.heading(LAUNCHED));
}

/** {@link launchSix}, confirmed with `y` as the dialog says: the run view takes the screen. */
export async function runSix(stage: Stage): Promise<void> {
  await launchSix(stage);
  await stage.press("y");
}
