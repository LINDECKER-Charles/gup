import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_UI_PREFERENCES,
  setUiPreferencesSource,
} from "../../../src/ui/app/ui-preferences.js";
import { withScanScreen } from "../../../src/ui/prompts/scan-screen.js";
import { STATUS_GLYPHS } from "../../../src/ui/theme/glyphs.js";
import { createTestHost, frame } from "../../support/tui/test-host.js";

const SPINNER = new RegExp(`[${STATUS_GLYPHS.running.join("")}] {2}détection`);
const FRAMES_APART_MS = 350;

afterEach(() => {
  setUiPreferencesSource(null);
});

/** The spinner of the one-shot scan screen, read twice a few frames apart. */
async function spinnerTwice(): Promise<[string, string]> {
  const { host, next } = createTestHost();
  let finish = (): void => {};
  const run = withScanScreen((events) => {
    events.detecting();
    return new Promise<void>((resolve) => (finish = resolve));
  }, host);
  const screen = await next();
  await screen.waitForFrame((text) => SPINNER.test(text));
  const first = (await frame(screen)).match(SPINNER)?.[0] ?? "";
  await new Promise((resolve) => setTimeout(resolve, FRAMES_APART_MS));
  const later = (await frame(screen)).match(SPINNER)?.[0] ?? "";
  finish();
  await run;
  return [first, later];
}

describe("withScanScreen", () => {
  it("turns its spinner, and keeps it still while animations are off", async () => {
    const [turning, turned] = await spinnerTwice();
    expect(turned).not.toBe(turning);

    const still = { ...DEFAULT_UI_PREFERENCES, animations: false };
    setUiPreferencesSource({ current: () => still, subscribe: () => () => {} });
    const [first, later] = await spinnerTwice();
    expect(later).toBe(first);
  });
});
