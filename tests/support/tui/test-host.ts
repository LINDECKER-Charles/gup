import { createTestRenderer, type TestRendererSetup } from "@opentui/core/testing";
import type { AppearanceFactory } from "../../../src/ui/theme/appearance.js";
import { createScreenHost, type ScreenHost } from "../../../src/ui/tui/screen-host.js";

/**
 * A screen host backed by OpenTUI's in-memory renderer: same lifecycle as the
 * real one (one renderer per run, destroyed after), no terminal involved.
 * `next()` hands back the renderer of the run in progress, once something is
 * drawn on it, so the test can press keys and read the frame.
 */
export interface TestHost {
  readonly host: ScreenHost;
  next(): Promise<TestRendererSetup>;
}

export interface TestHostOptions {
  /** Terminal size; default 100 × 30. */
  readonly size?: { readonly cols: number; readonly rows: number };
  /** The screens' look; default: whatever `configureScreens` installed (legacy). */
  readonly createAppearance?: AppearanceFactory;
}

const DEFAULT_SIZE = { cols: 100, rows: 30 };

export function createTestHost(options: TestHostOptions = {}): TestHost {
  const { cols, rows } = options.size ?? DEFAULT_SIZE;
  const pending: TestRendererSetup[] = [];
  const waiting: Array<(setup: TestRendererSetup) => void> = [];

  const host = createScreenHost(async () => {
    // Configured like the real renderer: Ctrl+C and signals belong to the screen host.
    const setup = await createTestRenderer({
      width: cols,
      height: rows,
      exitOnCtrlC: false,
      exitSignals: [],
    });
    const waiter = waiting.shift();
    if (waiter) waiter(setup);
    else pending.push(setup);
    return setup.renderer;
  }, options.createAppearance);

  const created = (): Promise<TestRendererSetup> => {
    const ready = pending.shift();
    return ready ? Promise.resolve(ready) : new Promise((resolve) => waiting.push(resolve));
  };

  return {
    host,
    // The renderer exists before the screen mounts on it: wait for a first
    // drawn frame, or the first keys would reach a screen with no listener.
    next: async () => {
      const setup = await created();
      await setup.waitForFrame((text) => text.trim().length > 0);
      return setup;
    },
  };
}

const NAMED: Record<string, (setup: TestRendererSetup) => void> = {
  up: (s) => s.mockInput.pressArrow("up"),
  down: (s) => s.mockInput.pressArrow("down"),
  left: (s) => s.mockInput.pressArrow("left"),
  right: (s) => s.mockInput.pressArrow("right"),
  enter: (s) => s.mockInput.pressEnter(),
  escape: (s) => s.mockInput.pressEscape(),
  tab: (s) => s.mockInput.pressTab(),
  "ctrl+c": (s) => s.mockInput.pressCtrlC(),
  space: (s) => s.mockInput.pressKey(" "),
};

/** Press keys one by one, letting the renderer process each before the next. */
export async function press(setup: TestRendererSetup, ...keys: string[]): Promise<void> {
  for (const key of keys) {
    const named = NAMED[key];
    if (named) named(setup);
    else setup.mockInput.pressKey(key);
    await setup.flush();
  }
}

/** The current frame as text, trailing spaces trimmed per line. */
export async function frame(setup: TestRendererSetup): Promise<string> {
  await setup.renderOnce();
  return setup
    .captureCharFrame()
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trimEnd();
}
