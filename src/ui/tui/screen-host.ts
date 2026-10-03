import type { CliRenderer, KeyEvent } from "@opentui/core";
import { setFullScreen } from "../../core/process/output-router.js";
import { loadTui, type Tui } from "./load-tui.js";
import { PromptCancelledError } from "./prompt-cancelled.js";
import { destroyRenderer } from "./teardown.js";

/** The keys a view reacts to — a subset of OpenTUI's KeyEvent, easy to fake. */
export type KeyPress = Pick<KeyEvent, "name" | "ctrl" | "sequence">;

/** A terminal surface for the length of one session. */
export interface Screen {
  readonly renderer: CliRenderer;
  readonly tui: Tui;
}

/**
 * Where gup gets a full-screen surface. Injected so tests can hand in
 * OpenTUI's in-memory renderer instead of the real terminal.
 */
export interface ScreenHost {
  run<T>(mount: (screen: Screen) => Promise<T>): Promise<T>;
}

export type RendererFactory = (tui: Tui) => Promise<CliRenderer>;

/**
 * Build a host around a renderer factory. The renderer lives for one `run`
 * only and is destroyed whatever happens, so nothing keeps stdin in raw mode
 * once the session is over — in particular not while an installer runs with
 * the terminal inherited. Ctrl+C rejects with {@link PromptCancelledError}.
 *
 * While the renderer is up, the output router holds back gup's own console
 * lines (a history warning, a provider's progress note): written now, they
 * would paint over the frame. They are printed once the process exits.
 */
export function createScreenHost(createRenderer: RendererFactory): ScreenHost {
  return {
    async run(mount) {
      const tui = await loadTui();
      const renderer = await createRenderer(tui);
      setFullScreen(true);
      try {
        return await untilCancelled(renderer, mount({ renderer, tui }));
      } finally {
        try {
          await destroyRenderer(renderer);
        } finally {
          setFullScreen(false);
        }
      }
    },
  };
}

/**
 * True when a screen can be shown at all: both ends are a terminal, and the
 * run is not unattended. A scheduled run sets `GUP_NONINTERACTIVE=1`: under
 * `conhost --headless` both ends ARE terminals that nobody watches, so an
 * accidental prompt must fail fast instead of waiting forever.
 */
export function canPrompt(): boolean {
  if (process.env["GUP_NONINTERACTIVE"] === "1") return false;
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

/**
 * The real terminal, on its alternate screen: gup's screens take the whole
 * window, and on exit the terminal itself puts back the main screen exactly
 * as it was, so everything printed before (and the install logs) stays put.
 *
 * Not split-footer: on teardown OpenTUI's native side moved the cursor to a
 * wrong row and cleared everything below it, wiping visible output, whenever
 * the band did not start near the top of the screen (reproduced on Windows,
 * OpenTUI 0.5.14). The alternate screen leaves no position to get wrong.
 */
export const screenHost = createScreenHost(async (tui) => {
  if (!canPrompt()) {
    throw new Error("cette action demande un terminal interactif (stdin/stdout TTY)");
  }
  return tui.createCliRenderer({
    screenMode: "alternate-screen",
    exitOnCtrlC: false,
    useMouse: true,
    consoleMode: "disabled",
  });
});

function untilCancelled<T>(renderer: CliRenderer, work: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    renderer.keyInput.on("keypress", (key: KeyEvent) => {
      if (key.ctrl && key.name === "c") reject(new PromptCancelledError());
    });
    work.then(resolve, reject);
  });
}
