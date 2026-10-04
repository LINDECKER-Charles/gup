import type { BoxRenderable, TextRenderable } from "@opentui/core";
import type { PtyPane, PtyPanes } from "../../../core/pty/pty-sink.js";
import type { UpdateOutcome } from "../../../core/types.js";
import type { Screen } from "../../tui/screen-host.js";
import { seg, toStyledText } from "../../tui/styled-lines.js";
import type { PromptSample } from "./prompt-hint.js";
import { TerminalPane } from "./terminal-pane.js";

/** Failed and skipped packages keep their terminal, newest first, up to this many. */
const RETAINED_FAILURE_PANES = 12;
/** The most recent successes keep theirs too (exported for the tests). */
export const RETAINED_RECENT_PANES = 3;

/** The elevated step's pane; no package key looks like it (a provider id is never empty). */
export const ELEVATED_PANE_KEY = ":elevated";
/** Where output lands if an install starts while no package announced itself (defensive). */
const UNANNOUNCED_PANE_KEY = ":unannounced";

type Retention = "failure" | "recent";

export interface PaneSize {
  readonly cols: number;
  readonly rows: number;
}

export interface TerminalPanesOptions {
  /** The pane size the layout expects, before it is laid out. */
  readonly sizeHint: () => PaneSize;
  /** Time of the children's output, for the prompt hint. */
  readonly clock: () => number;
}

/**
 * The run's terminal panes: one per package (and one for the elevated step),
 * a single one visible at a time. The PTY sink writes into the pane of the
 * package that starts (`current()`), the run view moves the keyboard in and
 * out, and the results show any retained pane again.
 *
 * Retention bounds memory (a pane keeps up to about 1 MB of scrollback):
 * failures and skips keep their pane — the output is what tells why — up to
 * {@link RETAINED_FAILURE_PANES}; the {@link RETAINED_RECENT_PANES} latest
 * successes keep theirs; any other pane goes when the next one opens.
 */
export class TerminalPanes implements PtyPanes {
  readonly #screen: Screen;
  readonly #host: BoxRenderable;
  readonly #sizeHint: () => PaneSize;
  readonly #clock: () => number;
  readonly #panes = new Map<string, TerminalPane>();
  /** Settled panes, oldest first. */
  readonly #settled = new Map<string, Retention>();
  #current: TerminalPane | null = null;
  #placeholder: TextRenderable | null = null;
  #locks = 0;
  #serial = 0;

  constructor(screen: Screen, host: BoxRenderable, options: TerminalPanesOptions) {
    this.#screen = screen;
    this.#host = host;
    this.#sizeHint = options.sizeHint;
    this.#clock = options.clock;
  }

  /** Show the pane of `key` — a new one, or its pane again for a retry. */
  open(key: string, title: string): void {
    this.reveal(key, title);
  }

  current(): PtyPane {
    return this.#current ?? this.reveal(UNANNOUNCED_PANE_KEY, "");
  }

  /** Title of the pane on screen, or null when none is. */
  get title(): string | null {
    return this.#current?.title ?? null;
  }

  /** The pane on screen has a child to type into. */
  get hasChild(): boolean {
    return this.#current?.isAttached === true;
  }

  get isFocused(): boolean {
    return this.#current?.isFocused === true;
  }

  /** Typing mode: the child gets the keys. False when there is no child, or a dialog is open. */
  focus(): boolean {
    return this.#current?.focus() ?? false;
  }

  blur(): void {
    this.#current?.blur();
  }

  /** No pane takes keys or clicks until the returned release (a dialog is open). */
  lock(): () => void {
    this.#locks++;
    this.setLocked(true);
    let isReleased = false;
    return () => {
      if (isReleased) return;
      isReleased = true;
      this.#locks--;
      if (this.#locks === 0) this.setLocked(false);
    };
  }

  /** What the child on screen looks like it waits for; null without a child. */
  promptSample(): PromptSample | null {
    return this.hasChild ? (this.#current?.promptSample() ?? null) : null;
  }

  /** The package of `key` ended: decide whether its pane outlives the next one. */
  settle(key: string, outcome: UpdateOutcome): void {
    if (!this.#panes.has(key)) return;
    this.#settled.delete(key);
    this.#settled.set(key, outcome.success ? "recent" : "failure");
  }

  /** Results: the retained output of `key`, or `placeholder` when it was not kept. */
  show(key: string, placeholder: string): void {
    const pane = this.#panes.get(key);
    if (pane) return this.display(pane);
    this.display(null);
    const text = this.placeholder();
    text.content = toStyledText(this.#screen, [[seg(placeholder, "muted")]]);
    text.visible = true;
  }

  destroy(): void {
    for (const pane of this.#panes.values()) pane.destroy();
    this.#panes.clear();
    this.#settled.clear();
    this.#current = null;
    this.#placeholder?.destroy();
    this.#placeholder = null;
  }

  private reveal(key: string, title: string): TerminalPane {
    const pane = this.#panes.get(key) ?? this.create(key, title);
    this.#settled.delete(key);
    this.display(pane);
    this.evict();
    return pane;
  }

  private create(key: string, title: string): TerminalPane {
    const pane = new TerminalPane(this.#screen, this.#host, {
      id: `gup-run-term-${++this.#serial}`,
      key,
      title,
      size: this.#sizeHint(),
      clock: this.#clock,
    });
    pane.setLocked(this.#locks > 0);
    this.#panes.set(key, pane);
    return pane;
  }

  /** Make `pane` the one on screen (none: hide them all). */
  private display(pane: TerminalPane | null): void {
    if (this.#current && this.#current !== pane) {
      this.#current.blur();
      this.#current.visible = false;
    }
    if (this.#placeholder) this.#placeholder.visible = false;
    this.#current = pane;
    if (pane) pane.visible = true;
  }

  /** Drop the panes the retention policy no longer keeps; never the one on screen. */
  private evict(): void {
    const keep = new Set([
      ...newest(this.#settled, "failure", RETAINED_FAILURE_PANES),
      ...newest(this.#settled, "recent", RETAINED_RECENT_PANES),
    ]);
    for (const key of [...this.#settled.keys()]) {
      const pane = this.#panes.get(key);
      if (keep.has(key) || !pane || pane === this.#current) continue;
      pane.destroy();
      this.#panes.delete(key);
      this.#settled.delete(key);
    }
  }

  private setLocked(isLocked: boolean): void {
    for (const pane of this.#panes.values()) pane.setLocked(isLocked);
  }

  private placeholder(): TextRenderable {
    if (this.#placeholder) return this.#placeholder;
    const { renderer, tui } = this.#screen;
    this.#placeholder = new tui.TextRenderable(renderer, {
      id: "gup-run-term-placeholder",
      wrapMode: "word",
      paddingLeft: 1,
    });
    this.#host.add(this.#placeholder);
    return this.#placeholder;
  }
}

/** The `count` most recently settled keys of `kind`. */
function newest(settled: ReadonlyMap<string, Retention>, kind: Retention, count: number): string[] {
  return [...settled]
    .filter(([, retention]) => retention === kind)
    .map(([key]) => key)
    .slice(-count);
}
