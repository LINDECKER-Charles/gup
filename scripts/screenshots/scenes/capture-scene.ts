import type { CapturedFrame } from "@opentui/core";
import type { TestRendererSetup } from "@opentui/core/testing";
import { MenuApp } from "../../../src/ui/app/menu-app.js";
import { sidebarEntries } from "../../../src/ui/app/sidebar.js";
import type { ViewDefinition, ViewId } from "../../../src/ui/app/view-definition.js";
import type { ScreenHost } from "../../../src/ui/tui/screen-host.js";
import { createTestHost, press } from "../../../tests/support/tui/test-host.js";
import { stepFrameClock } from "../sandbox/frozen-clock.js";
import { compose } from "./composition.js";
import type { Scene, Stage } from "./scene.js";

/** How long a scene may wait for its text: generous, the machine may be busy. */
const TEXT_WAIT_MS = 10_000;
const TEXT_POLL_MS = 25;

/**
 * Mount gup's interactive app (`MenuApp`, as `gup` starts it, composed as
 * its startup composes it) on OpenTUI's in-memory renderer of `scene.size`,
 * play the scene, and capture the frame's spans. The app always ends
 * afterwards — even when `play()` throws — the host releases the renderer as
 * on a normal exit, and the composition is undone.
 */
export async function captureScene(scene: Scene): Promise<CapturedFrame> {
  const fixture = scene.fixture();
  const { state, controller, views } = fixture;
  const composition = compose(fixture);
  const { host, next } = createTestHost({
    size: scene.size,
    createAppearance: composition.createAppearance,
  });
  const capture = new AbortController();
  const app = new MenuApp(
    { state, controller, views },
    { host: endsOn(capture.signal, host), pause: neverPauses },
  ).run();
  try {
    const setup = await Promise.race([next(), app.then(() => endedEarly(scene))]);
    await scene.play(stageOf(setup, views));
    await setup.renderOnce();
    return setup.captureSpans();
  } finally {
    fixture.release();
    capture.abort();
    await app
      .catch((error: unknown) => {
        if (error !== capture.signal.reason) throw error;
      })
      .finally(composition.undo);
  }
}

/**
 * `host`, whose screens also end once `signal` aborts, whatever the app is
 * doing (a dialog open, a held scan): the mount rejects with the abort reason
 * and the host tears the screen down as it does on any exit.
 */
function endsOn(signal: AbortSignal, host: ScreenHost): ScreenHost {
  const aborted = new Promise<never>((_, reject) => {
    if (signal.aborted) reject(signal.reason);
    else signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  });
  // A capture that ends before any screen mounted would otherwise leave this
  // rejection unhandled; mounted screens race it and hand it to the app.
  aborted.catch(() => undefined);
  return { run: (mount) => host.run((screen) => Promise.race([mount(screen), aborted])) };
}

function stageOf(setup: TestRendererSetup, views: readonly ViewDefinition[]): Stage {
  return {
    press: (...keys) => press(setup, ...keys),
    open: (view) => press(setup, ...sidebarKeys(views, view)),
    waitForText: (text) => waitForText(setup, text),
    tick: async () => {
      stepFrameClock();
      await setup.renderOnce();
    },
  };
}

/**
 * The keys that open `view` from whichever view is in front: Tab gives the
 * sidebar the keyboard, Up reaches its first entry (the cursor stops there),
 * Down walks to the view's entry, Entrée opens it. The entries come in the
 * production sidebar order, so the count never goes stale.
 */
function sidebarKeys(views: readonly ViewDefinition[], view: ViewId): string[] {
  const entries = sidebarEntries(views);
  const index = entries.findIndex((entry) => entry.id === view);
  if (index === -1) throw new Error(`the menu has no ${view} view`);
  const toFirst = Array<string>(entries.length - 1).fill("up");
  return ["tab", ...toFirst, ...Array<string>(index).fill("down"), "enter"];
}

/**
 * Until `text` is on screen. OpenTUI's own wait gives up as soon as the
 * renderer is idle, which it is while a view loads its data (a file, a
 * port): retry until a wall-clock deadline — `performance.now()`, since
 * `Date` is frozen — then fail with OpenTUI's error, which dumps the frame.
 */
async function waitForText(setup: TestRendererSetup, text: string): Promise<void> {
  const deadline = performance.now() + TEXT_WAIT_MS;
  for (;;) {
    try {
      await setup.waitForFrame((frame) => frame.includes(text));
      return;
    } catch (error) {
      if (performance.now() >= deadline) throw error;
      await new Promise((resolve) => setTimeout(resolve, TEXT_POLL_MS));
    }
  }
}

/** The app waits for Entrée only after an update on the plain terminal: never in a scene. */
function neverPauses(): Promise<void> {
  return Promise.reject(new Error("a screenshot never leaves the screen"));
}

function endedEarly(scene: Scene): never {
  throw new Error(`${scene.id}: the app ended before drawing its first frame`);
}
