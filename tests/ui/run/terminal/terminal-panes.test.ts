import { createTestRenderer, type TestRendererSetup } from "@opentui/core/testing";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import type { PtyInput } from "../../../../src/core/pty/pty-sink.js";
import {
  RETAINED_RECENT_PANES,
  TerminalPanes,
} from "../../../../src/ui/run/terminal/terminal-panes.js";
import { legacyAppearance } from "../../../../src/ui/theme/legacy-appearance.js";
import { loadTui } from "../../../../src/ui/tui/load-tui.js";
import type { Screen } from "../../../../src/ui/tui/screen-host.js";
import { outcome } from "../../../support/builders.js";

const COLS = 60;
const ROWS = 12;
const PLACEHOLDER = "rien de conservé";

/** Real embedded terminals on OpenTUI's in-memory renderer, filling the screen. */
async function panesOnScreen() {
  const setup = await createTestRenderer({
    width: COLS,
    height: ROWS,
    exitOnCtrlC: false,
    exitSignals: [],
  });
  onTestFinished(() => setup.renderer.destroy());
  const tui = await loadTui();
  const screen: Screen = {
    renderer: setup.renderer,
    tui,
    appearance: legacyAppearance(setup.renderer, tui),
    interceptCtrlC: () => () => {},
  };
  const host = new tui.BoxRenderable(setup.renderer, {
    id: "host",
    width: "100%",
    height: "100%",
    flexDirection: "column",
  });
  setup.renderer.root.add(host);
  const panes = new TerminalPanes(screen, host, {
    sizeHint: () => ({ cols: COLS, rows: ROWS }),
    clock: () => 0,
  });
  return { setup, panes };
}

function recordingInput() {
  const written: string[] = [];
  const input: PtyInput = {
    write: vi.fn((data: string | Uint8Array) => {
      written.push(typeof data === "string" ? data : Buffer.from(data).toString("latin1"));
    }),
    resize: vi.fn(),
  };
  return { input, written };
}

async function screenText(setup: TestRendererSetup): Promise<string> {
  await setup.renderOnce();
  return setup.captureCharFrame();
}

describe("TerminalPanes", () => {
  it("shows one package's terminal at a time, and a retained one again on the results", async () => {
    const { setup, panes } = await panesOnScreen();
    panes.open("winget:a", "Winget · a");
    panes.current().write("sortie de a\r\n");
    panes.settle("winget:a", outcome("a", { success: false }));
    panes.open("winget:b", "Winget · b");
    panes.current().write("sortie de b\r\n");
    expect(panes.title).toBe("Winget · b");
    const during = await screenText(setup);
    expect(during).toContain("sortie de b");
    expect(during).not.toContain("sortie de a");

    panes.show("winget:a", PLACEHOLDER);
    expect(await screenText(setup)).toContain("sortie de a");
  });

  it("keeps only the latest successes once the next package opens", async () => {
    const { setup, panes } = await panesOnScreen();
    const keys = Array.from({ length: RETAINED_RECENT_PANES + 1 }, (_, index) => `p:${index}`);
    for (const key of keys) {
      panes.open(key, key);
      panes.current().write(`sortie ${key}\r\n`);
      panes.settle(key, outcome(key));
    }
    panes.open("p:next", "p:next");

    panes.show(keys[0]!, PLACEHOLDER);
    expect(await screenText(setup)).toContain(PLACEHOLDER);
    panes.show(keys[1]!, PLACEHOLDER);
    expect(await screenText(setup)).toContain(`sortie ${keys[1]}`);
  });

  it("writes gup's notes dimmed, on their own line", async () => {
    const { setup, panes } = await panesOnScreen();
    panes.open("p:a", "a");
    panes.current().write("en cours");
    panes.current().note("Validez l'invite UAC.");
    const lines = (await screenText(setup)).split("\n").map((line) => line.trimEnd());
    expect(lines.slice(0, 2)).toEqual(["en cours", "› Validez l'invite UAC."]);
    expect(panes.current().tail()).toBe("en cours\n› Validez l'invite UAC.");
  });

  it("gives the keyboard to an attached child only, and takes it back on detach", async () => {
    const { setup, panes } = await panesOnScreen();
    panes.open("p:a", "a");
    expect(panes.focus()).toBe(false);

    const { input, written } = recordingInput();
    const detach = panes.current().attach(input);
    expect(panes.hasChild).toBe(true);
    expect(panes.focus()).toBe(true);
    setup.mockInput.pressKey("y");
    setup.mockInput.pressEnter();
    await setup.flush();
    expect(written).toEqual(["y", "\r"]);

    detach();
    expect(panes.isFocused).toBe(false);
    expect(panes.focus()).toBe(false);
  });

  it("takes neither keys nor clicks while locked, and still answers the child's queries", async () => {
    const { setup, panes } = await panesOnScreen();
    panes.open("p:a", "a");
    const { input, written } = recordingInput();
    panes.current().attach(input);
    expect(panes.focus()).toBe(true);

    const release = panes.lock();
    expect(panes.isFocused).toBe(false);
    expect(panes.focus()).toBe(false);
    await setup.mockMouse.click(5, 5);
    setup.mockInput.pressEnter();
    await setup.flush();
    expect(panes.isFocused).toBe(false);
    expect(written).toEqual([]);

    panes.current().write("\x1b[6n"); // a cursor position report request
    expect(written).toEqual([expect.stringMatching(/^\x1b\[\d+;\d+R$/)]);

    release();
    expect(panes.focus()).toBe(true);
  });

  it("resizes the attached child with its pane", async () => {
    const { setup, panes } = await panesOnScreen();
    panes.open("p:a", "a");
    const { input } = recordingInput();
    panes.current().attach(input);
    await setup.renderOnce();
    setup.resize(COLS + 20, ROWS + 4);
    await setup.renderOnce();
    expect(input.resize).toHaveBeenLastCalledWith(COLS + 20, ROWS + 4);
    expect(panes.current().size()).toEqual({ cols: COLS + 20, rows: ROWS + 4 });
  });
});
