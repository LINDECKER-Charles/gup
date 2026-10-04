import type { BoxRenderable, TextRenderable } from "@opentui/core";
import { gupVersion } from "../../core/version.js";
import type { Screen } from "./screen-host.js";
import { fillLine, seg, toStyledText, type Line } from "./styled-lines.js";
import { panelFrame } from "./text-panel.js";

/** Rows the chrome itself takes: the title bar and the key-hint bar. */
export const CHROME_ROWS = 2;

/** Between two key hints. */
const HINT_SEPARATOR = " · ";
/** Stands for the hints cut off the end. */
const CUT_MARK = "…";
/** The hint bar's leading blank. */
const HINT_INDENT = 1;

/**
 * The key hints that fit `width` columns: `hints` cut between two of its
 * items, the cut marked "…", never inside a word; `pinned` (the keys every
 * screen shares, "tab menu · q quitter") always whole, at the end. Hints come
 * most important first, so the cut drops the last ones.
 */
export function fitHints(hints: string, pinned: string, width: number): string {
  const tail = pinned === "" ? [] : [pinned];
  const items = hints === "" ? [] : hints.split(HINT_SEPARATOR);
  const full = [...items, ...tail].join(HINT_SEPARATOR);
  if (full.length <= width) return full;
  for (let kept = items.length - 1; kept > 0; kept--) {
    const line = [...items.slice(0, kept), CUT_MARK, ...tail].join(HINT_SEPARATOR);
    if (line.length <= width) return line;
  }
  return [CUT_MARK, ...tail].join(HINT_SEPARATOR);
}

/** Room inside a lone panel that fills the whole body (the one-shot screens). */
export function bodyPanelSize(screen: Pick<Screen, "renderer" | "appearance">): {
  readonly width: number;
  readonly height: number;
} {
  const frame = panelFrame(screen.appearance.density);
  const { terminalWidth, terminalHeight } = screen.renderer;
  return { width: terminalWidth - frame.cols, height: terminalHeight - CHROME_ROWS - frame.rows };
}

/**
 * The frame every gup screen shares: a title bar carrying the version and a
 * few facts about the session, a body the screen fills with panels, and a
 * bar of key hints at the bottom.
 */
export class Chrome {
  readonly body: BoxRenderable;
  readonly #screen: Screen;
  readonly #top: TextRenderable;
  readonly #status: TextRenderable;
  readonly #root: BoxRenderable;
  #facts: readonly string[] = [];
  #hints = "";
  #pinnedHints = "";

  constructor(screen: Screen) {
    const { renderer, tui } = screen;
    this.#screen = screen;
    const root = new tui.BoxRenderable(renderer, {
      id: "gup-root",
      flexDirection: "column",
      width: "100%",
      height: "100%",
      backgroundColor: screen.appearance.background(),
    });
    this.#root = root;
    this.#top = new tui.TextRenderable(renderer, { id: "gup-top", height: 1 });
    this.body = new tui.BoxRenderable(renderer, {
      id: "gup-body",
      flexDirection: "row",
      flexGrow: 1,
    });
    this.#status = new tui.TextRenderable(renderer, { id: "gup-status", height: 1 });
    root.add(this.#top);
    root.add(this.body);
    root.add(this.#status);
    renderer.root.add(root);
    renderer.on("resize", () => this.draw());
    screen.appearance.onChange(() => this.draw());
    this.draw();
  }

  /** Facts shown in the title bar after the version: "27 providers", … */
  setFacts(facts: readonly string[]): void {
    this.#facts = facts;
    this.draw();
  }

  /** The screen's key hints, then `pinned`, kept whole when the bar is too narrow for all. */
  setHints(hints: string, pinned = ""): void {
    this.#hints = hints;
    this.#pinnedHints = pinned;
    this.draw();
  }

  private draw(): void {
    const { renderer, appearance } = this.#screen;
    this.#root.backgroundColor = appearance.background();
    const title: Line = [
      seg(" gup ", "onAccent"),
      seg(`v${gupVersion()}`, "onAccent"),
      ...this.#facts.map((fact) => seg(`  │  ${fact}`, "onAccent")),
    ];
    const width = renderer.terminalWidth;
    this.#top.content = toStyledText(this.#screen, [fillLine(title, width, "accent")]);
    const hints = fitHints(this.#hints, this.#pinnedHints, width - HINT_INDENT);
    this.#status.content = toStyledText(this.#screen, [[seg(` ${hints}`, "muted")]]);
  }
}
