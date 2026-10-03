import type { CliRenderer, KeyEvent, TextRenderable } from "@opentui/core";
import { gupVersion } from "../../core/version.js";
import { loadTui, type Tui } from "./load-tui.js";
import { PromptCancelledError } from "./prompt-cancelled.js";
import { seg, toStyledText, type Line } from "./styled-lines.js";

/** The keys a view reacts to — a subset of OpenTUI's KeyEvent, easy to fake. */
export type KeyPress = Pick<KeyEvent, "name" | "ctrl" | "sequence">;

/** Room a view can draw in, below the banner. */
export interface Viewport {
  readonly width: number;
  readonly height: number;
}

/**
 * A prompt as a small state machine: draw the current state, take a key.
 * `answer` stays undefined until a key completes the prompt; it is wrapped so
 * that `false` or `undefined` can be legitimate answers.
 */
export interface InteractiveView<T> {
  render(viewport: Viewport): readonly Line[];
  press(key: KeyPress): void;
  readonly answer: { readonly value: T } | undefined;
}

/** A terminal surface that exists for exactly one interaction. */
export interface PromptScreen {
  readonly renderer: CliRenderer;
  readonly tui: Tui;
  /** Replace everything under the banner with these lines. */
  show(lines: readonly Line[]): void;
  /** Drive a view until it answers. */
  interact<T>(view: InteractiveView<T>): Promise<T>;
}

/**
 * Where prompts and live views get a terminal surface. Injected so tests can
 * hand in OpenTUI's in-memory renderer instead of the real terminal.
 */
export interface PromptHost {
  run<T>(mount: (screen: PromptScreen) => Promise<T>): Promise<T>;
}

export type RendererFactory = (tui: Tui) => Promise<CliRenderer>;

/** Blank line, `gup  global updater  vX`, blank line. */
const BANNER_ROWS = 3;

/**
 * Build a host around a renderer factory. The renderer lives for one `run`
 * only and is destroyed whatever happens, so nothing keeps stdin in raw mode
 * once the interaction is over — in particular not while an installer runs
 * with the terminal inherited. Ctrl+C rejects with {@link PromptCancelledError}.
 */
export function createPromptHost(createRenderer: RendererFactory): PromptHost {
  return {
    async run(mount) {
      const tui = await loadTui();
      const renderer = await createRenderer(tui);
      try {
        return await untilCancelled(renderer, mount(openScreen(renderer, tui)));
      } finally {
        renderer.destroy();
      }
    },
  };
}

/** True when both ends are a terminal, i.e. when a prompt can be shown at all. */
export function canPrompt(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

/**
 * The real terminal, on its alternate screen: each interaction opens a clean
 * page, and on exit the terminal itself puts back the main screen exactly as
 * it was, so gup's log of what happened stays intact and the next line lands
 * right after it.
 *
 * Not split-footer, although drawing in a band under the log would read
 * better: on teardown OpenTUI's native side moved the cursor to a wrong row
 * and cleared everything below it, wiping visible output, whenever the band
 * did not start near the top of the screen (reproduced on Windows, OpenTUI
 * 0.5.14). The alternate screen leaves no position to get wrong.
 */
export const screenHost = createPromptHost(async (tui) => {
  if (!canPrompt()) {
    throw new Error("cette action demande un terminal interactif (stdin/stdout TTY)");
  }
  return tui.createCliRenderer({
    screenMode: "alternate-screen",
    exitOnCtrlC: false,
    useMouse: false,
    consoleMode: "disabled",
  });
});

function openScreen(renderer: CliRenderer, tui: Tui): PromptScreen {
  let surface: TextRenderable | null = null;
  const screen: PromptScreen = {
    renderer,
    tui,
    show(lines) {
      const content = toStyledText(tui, [...banner(renderer.terminalWidth), ...lines]);
      if (surface) {
        surface.content = content;
        return;
      }
      surface = new tui.TextRenderable(renderer, { id: "gup-surface", content, width: "100%" });
      renderer.root.add(surface);
    },
    interact: (view) => interact(screen, view),
  };
  return screen;
}

function banner(width: number): Line[] {
  const title = "gup  global updater";
  const version = `v${gupVersion()}`;
  const gap = Math.max(2, Math.min(width, 64) - title.length - version.length - 2);
  return [[], [seg("  "), seg("gup", "strong"), seg(`  global updater${" ".repeat(gap)}${version}`, "muted")], []];
}

function interact<T>(screen: PromptScreen, view: InteractiveView<T>): Promise<T> {
  const { renderer } = screen;
  return new Promise<T>((resolve) => {
    const draw = (): void =>
      screen.show(
        view.render({
          width: renderer.terminalWidth,
          height: Math.max(1, renderer.terminalHeight - BANNER_ROWS),
        }),
      );
    renderer.keyInput.on("keypress", (key: KeyEvent) => {
      view.press(key);
      if (view.answer) resolve(view.answer.value);
      else draw();
    });
    renderer.on("resize", draw);
    draw();
  });
}

function untilCancelled<T>(renderer: CliRenderer, work: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    renderer.keyInput.on("keypress", (key: KeyEvent) => {
      if (key.ctrl && key.name === "c") reject(new PromptCancelledError());
    });
    work.then(resolve, reject);
  });
}
