import type { Stage } from "../scene.js";

/** What shows once the scan is over, Paquets in front: the last package of the table. */
export const SCAN_DONE = "Visual Studio Code";

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

/** The README's Paquets: Winget checked as a group, pnpm alone, the cursor on ruff. */
export async function checkWingetAndPnpm(stage: Stage): Promise<void> {
  await stage.waitForText(SCAN_DONE);
  await stage.press(...times(13, "down"), "space", ...times(6, "up"), "space", ...times(3, "down"));
  await stage.waitForText("5 sur 12 coché(s)");
}

/**
 * The six packages the update scenes run — nodejs-lts (admin), typescript,
 * ruff, Git, PowerToys, 7-Zip — then Entrée: the confirmation opens.
 */
export async function launchSix(stage: Stage): Promise<void> {
  await stage.waitForText(SCAN_DONE);
  await stage.press(...times(4, "down"), "space", ...times(2, "down"), "space");
  await stage.press(...times(4, "down"), "space", ...times(4, "down"), "space");
  await stage.press("down", "space", "down", "space");
  await stage.waitForText("6 sur 12 coché(s)");
  await stage.press("enter");
  await stage.waitForText("être mis à jour :");
}

/** {@link launchSix}, confirmed: the run view takes the screen. */
export async function runSix(stage: Stage): Promise<void> {
  await launchSix(stage);
  await stage.press("o");
}
