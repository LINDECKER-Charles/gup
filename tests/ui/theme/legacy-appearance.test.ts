import type { CapturedSpan } from "@opentui/core";
import type { TestRendererSetup } from "@opentui/core/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Chrome } from "../../../src/ui/tui/chrome.js";
import { DialogLayer } from "../../../src/ui/tui/dialog.js";
import type { Screen } from "../../../src/ui/tui/screen-host.js";
import { seg, type Fill, type Tone } from "../../../src/ui/tui/styled-lines.js";
import { TextPanel } from "../../../src/ui/tui/text-panel.js";
import { createTestHost, frame } from "../../support/tui/test-host.js";

/**
 * The legacy appearance must paint exactly what gup painted before the
 * appearance seam: ANSI palette slots for coloured tones, OpenTUI's default
 * colour for the others, BOLD/DIM attributes, slot 8 / slot 6 borders. These
 * expectations are today's span intents, written out.
 */
const BOLD = 1;
const DIM = 2;
const TONES: ReadonlyArray<[Tone, string, number]> = [
  ["plain", "default", 0],
  ["strong", "default", BOLD],
  ["muted", "default", DIM],
  ["disabled", "default", DIM],
  ["accent", "indexed:6", 0],
  ["success", "indexed:2", 0],
  ["warning", "indexed:3", 0],
  ["danger", "indexed:1", 0],
  ["onAccent", "indexed:0", BOLD],
];
const FILLS: ReadonlyArray<[Fill | undefined, string]> = [
  [undefined, "none"],
  ["highlight", "indexed:8"],
  ["accent", "indexed:6"],
];

afterEach(() => {
  vi.unstubAllEnvs();
});

/** Colour as the regression table writes it: a palette slot, or OpenTUI's own default. */
function fgOf(span: CapturedSpan): string {
  return span.fg.intent === "indexed" ? `indexed:${span.fg.slot}` : "default";
}

function bgOf(span: CapturedSpan): string {
  if (span.bg.intent === "indexed") return `indexed:${span.bg.slot}`;
  return span.bg.a === 0 ? "none" : "painted";
}

/** Mount `draw` on a test screen, hand the renderer to `inspect`, then unmount. */
async function onScreen(
  draw: (screen: Screen) => void,
  inspect: (setup: TestRendererSetup) => Promise<void>,
): Promise<void> {
  const { host, next } = createTestHost({ size: { cols: 80, rows: 40 } });
  let finish = (): void => {};
  const run = host.run((screen) => {
    draw(screen);
    return new Promise<void>((resolve) => (finish = resolve));
  });
  const setup = await next();
  await setup.renderOnce();
  await inspect(setup);
  finish();
  await run;
}

function spanOf(setup: TestRendererSetup, text: string): CapturedSpan {
  const spans = setup.captureSpans().lines.flatMap((line) => line.spans);
  const span = spans.find((s) => s.text.includes(text));
  if (!span) throw new Error(`no span with ${text}`);
  return span;
}

describe("legacy appearance", () => {
  it("paints every tone and fill with today's palette slots and attributes", async () => {
    const lines = FILLS.flatMap(([fill, name]) =>
      TONES.map(([tone]) => [seg(`${tone}-on-${name}`, tone, fill)]),
    );
    await onScreen(
      (screen) => new TextPanel(screen, new Chrome(screen).body, { id: "p", title: "P" }).show(lines),
      async (setup) => {
        for (const [fill, name] of FILLS) {
          for (const [tone, fg, attributes] of TONES) {
            const span = spanOf(setup, `${tone}-on-${name}`);
            expect({ tone, fill: name, fg: fgOf(span), bg: bgOf(span), a: span.attributes }).toEqual(
              { tone, fill: name, fg, bg: fill === undefined ? "none" : name, a: attributes },
            );
          }
        }
      },
    );
  });

  it("draws idle panels rounded on slot 8, the focused one heavy on slot 6", async () => {
    await onScreen(
      (screen) => {
        const chrome = new Chrome(screen);
        new TextPanel(screen, chrome.body, { id: "idle", title: "Repos", width: 30 });
        new TextPanel(screen, chrome.body, { id: "focus", title: "Actif" }).setFocused(true);
      },
      async (setup) => {
        expect(fgOf(spanOf(setup, "Repos"))).toBe("indexed:8");
        expect(fgOf(spanOf(setup, "Actif"))).toBe("indexed:6");
        const text = await frame(setup);
        expect(text).toContain("╭─ Repos");
        expect(text).toContain("┏━ Actif");
      },
    );
  });

  it("frames dialogs with a slot-6 double border over the terminal's background", async () => {
    await onScreen(
      (screen) => {
        new Chrome(screen);
        void new DialogLayer(screen).confirm({ title: "Question" });
      },
      async (setup) => {
        const border = spanOf(setup, "Question");
        expect(fgOf(border)).toBe("indexed:6");
        expect(border.bg.intent).toBe("default");
        expect(await frame(setup)).toContain("╔═ Question");
      },
    );
  });

  it("draws the whole frame in ASCII when GUP_ASCII=1", async () => {
    vi.stubEnv("GUP_ASCII", "1");
    await onScreen(
      (screen) => {
        const chrome = new Chrome(screen);
        chrome.setHints("↑↓ naviguer · entrée ouvrir");
        new TextPanel(screen, chrome.body, { id: "p", title: "Paquets › tri" }).show([
          [seg("▌ ", "accent"), seg("√ à jour"), seg(" │ █░", "muted")],
        ]);
      },
      async (setup) => {
        const text = await frame(setup);
        expect([...text].filter((c) => c.charCodeAt(0) > 0x7f && !/\p{L}/u.test(c))).toEqual([]);
        expect(text).toContain("+- Paquets > tri -");
        expect(text).toContain("| + à jour | #.");
        expect(text).toContain("^v naviguer . entrée ouvrir");
      },
    );
  });
});
