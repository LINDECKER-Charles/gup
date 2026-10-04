import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { CONFIRM_UPDATE, VIEW_LABELS } from "../../../src/ui/text/menu-labels.js";
import { PACKAGES_HINTS, SELECTION_BAR } from "../../../src/ui/text/packages-labels.js";
import { saveArtifact } from "../../support/e2e/artifacts.js";
import { installedVersion, installGlobal, latestVersion } from "../../support/e2e/npm-prefix.js";
import { detectTerminal, PtySession } from "../../support/e2e/pty-session.js";
import { createSandbox, restrictMenuScan, type Sandbox } from "../../support/e2e/sandbox.js";

/**
 * Picking packages in Paquets, on a real terminal: two outdated packages in
 * the sandbox's npm prefix (installed from the registry, so this suite needs
 * the network), all checked with `a`, one unchecked with Espace, Entrée
 * asks before updating the other — and answering "non" updates nothing.
 */

const terminal = await detectTerminal();
/** Tiny, dependency-free, install-script-free, and far behind their latest release. */
const OUTDATED = { "is-number": "6.0.0", ms: "2.0.0" } as const;
type Name = keyof typeof OUTDATED;
const NAMES = Object.keys(OUTDATED) as Name[];
const INSTALL_TIMEOUT_MS = 180_000;

let sandbox: Sandbox;
let session: PtySession | null = null;

beforeAll(async () => {
  sandbox = await createSandbox("select");
  await installGlobal(sandbox, NAMES.map((name) => `${name}@${OUTDATED[name]}`));
  restrictMenuScan(sandbox, ["npm-g"]);
}, INSTALL_TIMEOUT_MS);

afterEach(async ({ task }) => {
  if (session && task.result?.state === "fail") {
    await saveArtifact(`screens/${task.name}.txt`, (await session.screen()).text);
  }
  await session?.dispose();
  session = null;
});

afterAll(async () => {
  await sandbox.dispose();
});

describe.skipIf(!terminal.isAvailable)("checking packages in Paquets", () => {
  it("checks all, unchecks one, and asks before updating the other", async () => {
    if (!terminal.isAvailable) return;
    const menu = (session = PtySession.start(terminal.pty, sandbox));
    // A scan that finds updates opens Paquets, its cursor on the group's row.
    for (const name of NAMES) await menu.waitForText(` ${name} `);
    await menu.waitForText(`┏━ ${VIEW_LABELS.packages}`);

    await menu.type("a");
    await menu.waitForText(SELECTION_BAR.count(2, 2));
    await menu.waitForText(PACKAGES_HINTS.clearAll);

    await menu.press("down", "space");
    const unchecked = await packageUnderCursor(menu);
    await menu.waitForText(SELECTION_BAR.count(1, 2));
    await menu.waitForText(SELECTION_BAR.button(1));

    await menu.press("enter");
    const kept = NAMES.find((name) => name !== unchecked) ?? "";
    const item = CONFIRM_UPDATE.item({
      id: kept,
      current: OUTDATED[kept as Name],
      latest: await latestVersion(sandbox, kept),
    });
    const dialog = await menu.waitForText(CONFIRM_UPDATE.heading(1));
    // The dialog wraps its text by words: runs of spaces come out as one.
    expect(singleSpaced(dialog.text)).toContain(singleSpaced(item));

    await menu.type("n");
    await menu.waitForScreen((screen) => !screen.text.includes(CONFIRM_UPDATE.heading(1)), {
      what: "the confirmation closed",
    });
    for (const name of NAMES) expect(await installedVersion(sandbox, name)).toBe(OUTDATED[name]);

    await menu.type("q");
    expect(await menu.exited()).toBe(0);
  });
});

const singleSpaced = (text: string): string => text.replace(/ {2,}/g, " ");

async function packageUnderCursor(menu: PtySession): Promise<Name | undefined> {
  const screen = await menu.waitForText(/›\s+\[ \]/);
  const row = screen.lines.find((line) => /›\s+\[ \]/.test(line)) ?? "";
  return NAMES.find((name) => row.includes(` ${name} `));
}
