import type { CliRenderer, KeyEvent } from "@opentui/core";
import { log } from "../../core/log/log.js";
import { setFullScreen } from "../../core/process/output-router.js";
import type { Appearance, AppearanceFactory } from "../theme/appearance.js";
import { legacyAppearance } from "../theme/legacy-appearance.js";
import { loadTui, type Tui } from "./load-tui.js";
import { PromptCancelledError } from "./prompt-cancelled.js";
import { destroyRenderer } from "./teardown.js";

/** The keys a view reacts to — a subset of OpenTUI's KeyEvent, easy to fake. */
export type KeyPress = Pick<KeyEvent, "name" | "ctrl" | "sequence">;

/** A terminal surface for the length of one session. */
export interface Screen {
  readonly renderer: CliRenderer;
  readonly tui: Tui;
  readonly appearance: Appearance;
  /**
   * Ctrl+C calls `handler` instead of cancelling the screen until the returned
   * release runs. The latest interception wins; releasing is idempotent.
   */
  interceptCtrlC(handler: () => void): () => void;
}

/**
 * Where gup gets a full-screen surface. Injected so tests can hand in
 * OpenTUI's in-memory renderer instead of the real terminal.
 */
export interface ScreenHost {
  run<T>(mount: (screen: Screen) => Promise<T>): Promise<T>;
}

export type RendererFactory = (tui: Tui) => Promise<CliRenderer>;

/** What every screen gets unless its host says otherwise. */
export interface ScreenDefaults {
  readonly createAppearance: AppearanceFactory;
  readonly rendererOptions: () => { readonly useMouse: boolean };
}

const BUILTIN_DEFAULTS: ScreenDefaults = {
  createAppearance: legacyAppearance,
  rendererOptions: () => ({ useMouse: true }),
};

let defaults: ScreenDefaults = BUILTIN_DEFAULTS;

/**
 * Composition only — a CLI module's `beforeAction` (the settings module
 * installs the theme engine and the mouse preference here). Applies to the
 * screens opened afterwards; `null` restores the built-in defaults.
 */
export function configureScreens(next: Partial<ScreenDefaults> | null): void {
  defaults = next === null ? BUILTIN_DEFAULTS : { ...defaults, ...next };
}

/**
 * Build a host around a renderer factory. The renderer lives for one `run`
 * only and is destroyed whatever happens, so nothing keeps stdin in raw mode
 * once the session is over — in particular not while an installer runs with
 * the terminal inherited. Ctrl+C rejects with {@link PromptCancelledError}
 * unless the screen intercepts it.
 *
 * Order matters: once the renderer exists, everything runs inside the `try`
 * whose `finally` first settles the appearance (a late reply to a palette
 * query must not reach the shell), then destroys the renderer. An appearance
 * factory that throws falls back to the legacy look instead of leaving the
 * terminal on the alternate screen in raw mode.
 *
 * While the renderer is up, the output router holds back gup's own console
 * lines (a history warning, a provider's progress note): written now, they
 * would paint over the frame. They are printed once the process exits.
 */
export function createScreenHost(
  createRenderer: RendererFactory,
  createAppearance?: AppearanceFactory,
): ScreenHost {
  return {
    async run(mount) {
      const tui = await loadTui();
      const renderer = await createRenderer(tui);
      let appearance: Appearance | undefined;
      try {
        appearance = appearanceOf(renderer, tui, createAppearance ?? defaults.createAppearance);
        setFullScreen(true);
        return await mountScreen({ renderer, tui, appearance }, mount);
      } finally {
        await releaseScreen(renderer, appearance);
      }
    },
  };
}

function appearanceOf(renderer: CliRenderer, tui: Tui, factory: AppearanceFactory): Appearance {
  try {
    return factory(renderer, tui);
  } catch (error) {
    log.warn("ui.appearance-failed", { error: messageOf(error) });
    return legacyAppearance(renderer, tui);
  }
}

async function releaseScreen(
  renderer: CliRenderer,
  appearance: Appearance | undefined,
): Promise<void> {
  try {
    await appearance?.dispose?.();
  } catch (error) {
    log.warn("ui.appearance-dispose-failed", { error: messageOf(error) });
  }
  try {
    await destroyRenderer(renderer);
  } finally {
    setFullScreen(false);
  }
}

/**
 * Mount on a screen whose Ctrl+C rejects the run — or goes to the latest
 * interception. The listener is registered before the mount, so it hears
 * Ctrl+C before any view does: it is the single owner of that key.
 */
function mountScreen<T>(
  parts: Omit<Screen, "interceptCtrlC">,
  mount: (screen: Screen) => Promise<T>,
): Promise<T> {
  const interceptors: Array<() => void> = [];
  const screen: Screen = {
    ...parts,
    interceptCtrlC(handler) {
      const entry = (): void => handler();
      interceptors.push(entry);
      return () => {
        const index = interceptors.indexOf(entry);
        if (index !== -1) interceptors.splice(index, 1);
      };
    },
  };
  return new Promise<T>((resolve, reject) => {
    parts.renderer.keyInput.on("keypress", (key: KeyEvent) => {
      if (!key.ctrl || key.name !== "c") return;
      const intercept = interceptors.at(-1);
      if (intercept) intercept();
      else reject(new PromptCancelledError());
    });
    mount(screen).then(resolve, reject);
  });
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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
    useMouse: defaults.rendererOptions().useMouse,
    consoleMode: "disabled",
  });
});
