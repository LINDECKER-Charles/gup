import type { BoxRenderable, TextRenderable } from "@opentui/core";
import { gupVersion } from "../../core/version.js";
import type { Screen } from "./screen-host.js";
import { fillLine, seg, toStyledText, type Line } from "./styled-lines.js";

/** Rows the chrome itself takes: the title bar and the key-hint bar. */
export const CHROME_ROWS = 2;

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
    });
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
    const { tui, renderer } = this.#screen;
    const title: Line = [
      seg(" gup ", "onAccent"),
      seg(`v${gupVersion()}`, "onAccent"),
      ...this.#facts.map((fact) => seg(`  │  ${fact}`, "onAccent")),
    ];
    this.#top.content = toStyledText(tui, [fillLine(title, renderer.terminalWidth, "accent")]);
    this.#status.content = toStyledText(tui, [[seg(` ${this.#hints}`, "muted")]]);
  }
}
