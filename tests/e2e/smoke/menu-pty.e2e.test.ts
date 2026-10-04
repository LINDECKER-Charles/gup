import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import manifest from "../../../package.json" with { type: "json" };
import { JOURNAL_LABELS, TAB_LABELS } from "../../../src/ui/text/journal/journal-labels.js";
import {
  PANEL_HINTS_TAIL,
  QUIT_LABEL,
  updateCountFact,
  VIEW_LABELS,
} from "../../../src/ui/text/menu-labels.js";
import { PACKAGES_PLACEHOLDERS } from "../../../src/ui/text/packages-labels.js";
import { PROVIDERS_PANEL_LABELS } from "../../../src/ui/text/providers-labels.js";
import {
  EMPTY_SCHEDULES,
  SCHEDULES_LABEL,
} from "../../../src/ui/text/schedule/schedule-menu-labels.js";
import { OPTIONS_SECTIONS } from "../../../src/ui/text/settings/options-labels.js";
import { saveArtifact } from "../../support/e2e/artifacts.js";
import { createSandbox, restrictMenuScan, type Sandbox } from "../../support/e2e/sandbox.js";
import {
  detectTerminal,
  PtySession,
  type ScreenSnapshot,
} from "../../support/e2e/pty-session.js";
import { isPtyRequired } from "../../support/e2e/scope.js";
import { childProcessesOf, eventually } from "../../support/pty/processes.js";

/**
 * The interactive menu of the built CLI in a real pseudo-terminal (ConPTY on
 * Windows), read through a headless xterm: boot, every view of the sidebar,
 * quitting by `q`, by "Quitter" and by Ctrl+C, and a resize. The sandbox's
 * settings restrict the scan to npm on an empty global prefix, so the frames
 * are the same on every machine and nothing reaches the network.
 */

const terminal = await detectTerminal();
const SCAN_PROVIDERS = ["npm-g"];
const SIGINT_EXIT_CODE = 130;
const SMALL = { cols: 80, rows: 24 } as const;

/** Each view in sidebar order, under the cursor: its title, and a line only it draws. */
const VIEWS: ReadonlyArray<{ readonly title: string; readonly shows: string | RegExp }> = [
  { title: VIEW_LABELS.packages, shows: PACKAGES_PLACEHOLDERS.upToDate },
  { title: SCHEDULES_LABEL, shows: EMPTY_SCHEDULES[0] },
  { title: VIEW_LABELS.providers, shows: anyCount(PROVIDERS_PANEL_LABELS.detected) },
  { title: JOURNAL_LABELS.view, shows: TAB_LABELS[0] },
  { title: VIEW_LABELS.options, shows: OPTIONS_SECTIONS.scan },
];

/** How long an ended session's pseudo-console and processes may take to go. */
const SETTLE_MS = 15_000;

let sandbox: Sandbox;
let session: PtySession | null = null;
let childrenBefore: ReadonlySet<number>;

beforeAll(async () => {
  childrenBefore = new Set((await childProcessesOf(process.pid)).map((child) => child.pid));
  sandbox = await createSandbox("menu");
  restrictMenuScan(sandbox, SCAN_PROVIDERS);
});

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

function startMenu(): PtySession {
  if (!terminal.isAvailable) throw new Error(`no embedded terminal: ${terminal.reason}`);
  session = PtySession.start(terminal.pty, sandbox);
  return session;
}

/** The menu once its first scan finished: npm's empty prefix leaves nothing to update. */
async function scannedMenu(): Promise<PtySession> {
  const menu = startMenu();
  await menu.waitForText(`│  ${updateCountFact(0)}  │`);
  return menu;
}

describe("the embedded terminal", () => {
  it.skipIf(!isPtyRequired() && !terminal.isAvailable)("loads here", () => {
    expect(terminal).toMatchObject({ isAvailable: true });
  });
});

describe.skipIf(!terminal.isAvailable)("the menu in a real terminal", () => {
  it("draws its first frame on the alternate screen", async ({ annotate }) => {
    const startedAt = performance.now();
    const first = await startMenu().waitForText(`gup v${manifest.version}`);
    await annotate(`first frame ${Math.round(performance.now() - startedAt)} ms`);
    expect(first.buffer).toBe("alternate");
  });

  it("opens every view of the sidebar, then quits from it", async () => {
    const menu = await scannedMenu();
    await menu.press("tab");
    for (const view of VIEWS) {
      await menu.press("down");
      // The cursor shows the view; its frame stays light while the sidebar has the keys.
      const screen = await menu.waitForText(`╭─ ${view.title}`);
      await menu.waitForText(view.shows);
      expect(screen.text).toContain(`▌ ${view.title}`);
    }
    await menu.press("down");
    await menu.waitForText(`› ${QUIT_LABEL}`);
    await menu.press("enter");
    expect(await menu.exited()).toBe(0);
    expect((await menu.screen()).buffer).toBe("normal");
  });

  it("quits on q, exit 0, and gives the normal screen back", async ({ annotate }) => {
    const menu = await scannedMenu();
    const pressedAt = performance.now();
    await menu.type("q");
    expect(await menu.exited()).toBe(0);
    await annotate(`q → 0 in ${Math.round(performance.now() - pressedAt)} ms`);
    expect((await menu.screen()).buffer).toBe("normal");
  });

  it("ends on Ctrl+C with exit 130, the normal screen back", async () => {
    const menu = await scannedMenu();
    await menu.press("ctrl+c");
    expect(await menu.exited()).toBe(SIGINT_EXIT_CODE);
    expect((await menu.screen()).buffer).toBe("normal");
  });

  it("redraws to the terminal's new size", async () => {
    const menu = await scannedMenu();
    menu.resize(SMALL.cols, SMALL.rows);
    const screen = await waitForFrame(menu, SMALL);
    // The key hints moved to the new last row.
    expect(screen.lines[SMALL.rows - 1]).toContain(PANEL_HINTS_TAIL);
  });

  // Runs last: every session above has ended (afterEach). On Windows a
  // pseudo-console left open is a conhost.exe child of this process.
  it("leaves no process and no pseudo-console behind", async () => {
    const leftOver = async (): Promise<string[]> =>
      (await childProcessesOf(process.pid))
        .filter((child) => !childrenBefore.has(child.pid))
        .map((child) => child.name);
    await eventually(async () => (await leftOver()).length === 0, SETTLE_MS).catch(() => {});
    expect(await leftOver()).toEqual([]);
  });
});

type Size = { readonly cols: number; readonly rows: number };

/** The first screen whose panels close exactly on the last column, one row above the hints. */
function waitForFrame(menu: PtySession, size: Size): Promise<ScreenSnapshot> {
  const frameEnd = new RegExp(`^[┗╰].{${size.cols - 2}}[┛╯]$`);
  return menu.waitForScreen((screen) => frameEnd.test(screen.lines[size.rows - 2] ?? ""), {
    what: `a frame redrawn at ${size.cols}×${size.rows}`,
  });
}

/** A label built around a count (`Détectés (12)`), matching any count. */
function anyCount(label: (count: number) => string): RegExp {
  const [before = "", after = ""] = label(0).split("0");
  return new RegExp(`${escapeRegExp(before)}\\d+${escapeRegExp(after)}`);
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
