import { createTestRenderer, type TestRendererSetup } from "@opentui/core/testing";
import { createPromptHost, type PromptHost } from "../../src/ui/tui/prompt-host.js";

/**
 * A prompt host backed by OpenTUI's in-memory renderer: same lifecycle as the
 * real footer (one renderer per run, destroyed after), no terminal involved.
 * `next()` hands back the renderer of the run in progress so the test can
 * press keys and read the frame.
 */
export interface TestHost {
  readonly host: PromptHost;
  next(): Promise<TestRendererSetup>;
}

export function createTestHost(width = 80, height = 24): TestHost {
  const pending: TestRendererSetup[] = [];
  const waiting: Array<(setup: TestRendererSetup) => void> = [];

  const host = createPromptHost(async () => {
    const setup = await createTestRenderer({ width, height });
    const waiter = waiting.shift();
    if (waiter) waiter(setup);
    else pending.push(setup);
    return setup.renderer;
  });

  const created = (): Promise<TestRendererSetup> => {
    const ready = pending.shift();
    return ready ? Promise.resolve(ready) : new Promise((resolve) => waiting.push(resolve));
  };

  return {
    host,
    // The renderer exists before the prompt mounts on it: wait for a first
    // drawn frame, or the first keys would reach a screen with no listener.
    next: async () => {
      const setup = await created();
      await setup.waitForFrame((text) => text.trim().length > 0);
      return setup;
    },
  };
}

/** Press keys one by one, letting the renderer process each before the next. */
export async function press(setup: TestRendererSetup, ...keys: string[]): Promise<void> {
  for (const key of keys) {
    if (key === "down" || key === "up" || key === "left" || key === "right") {
      setup.mockInput.pressArrow(key);
    } else if (key === "enter") {
      setup.mockInput.pressEnter();
    } else if (key === "ctrl+c") {
      setup.mockInput.pressCtrlC();
    } else if (key === "space") {
      setup.mockInput.pressKey(" ");
    } else {
      setup.mockInput.pressKey(key);
    }
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
