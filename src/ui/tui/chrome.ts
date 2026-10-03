import type { BoxRenderable, TextRenderable } from "@opentui/core";
import { gupVersion } from "../../core/version.js";
import type { Screen } from "./screen-host.js";
import { fillLine, seg, toStyledText, type Line } from "./styled-lines.js";
import { panelFrame } from "./text-panel.js";

/** Rows the chrome itself takes: the title bar and the key-hint bar. */
export const CHROME_ROWS = 2;

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

  setHints(hints: string): void {
    this.#hints = hints;
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
    this.#status.content = toStyledText(this.#screen, [[seg(` ${this.#hints}`, "muted")]]);
  }
}
