import { describe, expect, it } from "vitest";
import type { AppearanceFactory } from "../../../src/ui/theme/appearance.js";
import { legacyAppearance } from "../../../src/ui/theme/legacy-appearance.js";
import { Chrome } from "../../../src/ui/tui/chrome.js";
import { seg } from "../../../src/ui/tui/styled-lines.js";
import { panelFrame, TextPanel } from "../../../src/ui/tui/text-panel.js";
import { createTestHost, frame } from "../../support/tui/test-host.js";

const compact: AppearanceFactory = (renderer, tui) => ({
  ...legacyAppearance(renderer, tui),
  density: "compact",
});

/** Frame rows of a screen holding one panel, after `act` ran on it. */
async function rowsOf(
  options: { readonly height?: number; readonly createAppearance?: AppearanceFactory },
  act: (panel: TextPanel) => void = () => {},
): Promise<string[]> {
  const { host, next } = createTestHost({
    size: { cols: 30, rows: 12 },
    ...(options.createAppearance && { createAppearance: options.createAppearance }),
  });
  let finish = (): void => {};
  const run = host.run((screen) => {
    const panel = new TextPanel(screen, new Chrome(screen).body, {
      id: "p",
      title: "Panneau",
      ...(options.height !== undefined && { height: options.height }),
    });
    panel.show([[seg("texte")]]);
    act(panel);
    return new Promise<void>((resolve) => (finish = resolve));
  });
  const rows = (await frame(await next())).split("\n");
  finish();
  await run;
  return rows;
}

describe("TextPanel", () => {
  it("loses its border and padding to the frame, padding none when compact", () => {
    expect(panelFrame("comfortable")).toEqual({ cols: 4, rows: 2 });
    expect(panelFrame("compact")).toEqual({ cols: 2, rows: 2 });
  });

  it("draws its content one column inside the border, against it when compact", async () => {
    expect((await rowsOf({}))[2]).toMatch(/^│ texte/);
    expect((await rowsOf({ createAppearance: compact }))[2]).toMatch(/^│texte/);
  });

  it("takes a fixed height, and a new one on demand", async () => {
    expect((await rowsOf({ height: 4 }))[4]).toMatch(/^╰/);
    expect((await rowsOf({ height: 4 }, (panel) => panel.setHeight(6)))[6]).toMatch(/^╰/);
  });
});
