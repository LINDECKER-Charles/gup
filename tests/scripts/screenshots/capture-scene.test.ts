import type { CapturedFrame } from "@opentui/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { appFixture, type AppFixture } from "../../../scripts/screenshots/fixtures/app-fixture.js";
import { FIXTURE_CLOCK } from "../../../scripts/screenshots/fixtures/clock.js";
import { PROVIDERS_FIXTURE } from "../../../scripts/screenshots/fixtures/providers.js";
import {
  SCHEDULES_FIXTURE,
} from "../../../scripts/screenshots/fixtures/schedules/schedule-data.js";
import type { ScriptedInstall } from "../../../scripts/screenshots/fixtures/update/scripted-run.js";
import { enterSandbox } from "../../../scripts/screenshots/sandbox/env-sandbox.js";
import { freezeClock } from "../../../scripts/screenshots/sandbox/frozen-clock.js";
import { spawnGuard } from "../../../scripts/screenshots/sandbox/no-spawn.js";
import { captureScene } from "../../../scripts/screenshots/scenes/capture-scene.js";
import type { Scene } from "../../../scripts/screenshots/scenes/scene.js";
import { effectiveLogThreshold } from "../../../src/core/log/log.js";
import { activeInheritSink } from "../../../src/core/process/inherit-sink.js";
import { outsideLauncher } from "../../../src/ui/app/outside-launcher.js";
import { DEFAULT_UI_PREFERENCES, uiPreferences } from "../../../src/ui/app/ui-preferences.js";
import { launcherFactory } from "../../../src/ui/app/update-launcher.js";
import { providersView } from "../../../src/ui/views/providers-view.js";

// The generator's setup, as scripts/screenshots/setup.ts installs it.
vi.mock("../../../src/core/runner.js", async (load) =>
  (await import("../../../scripts/screenshots/sandbox/no-spawn.js")).guardedModule(load, "runner"),
);
vi.mock("../../../src/core/pty/pty-loader.js", async (load) =>
  (await import("../../../scripts/screenshots/sandbox/no-spawn.js")).guardedModule(
    load,
    "ptyLoader",
  ),
);
vi.mock("../../../src/core/export/open-external.js", async (load) =>
  (await import("../../../scripts/screenshots/sandbox/no-spawn.js")).guardedModule(load, "opener"),
);
vi.mock("../../../src/core/scheduler/trigger/trigger-factory.js", async (load) =>
  (await import("../../../scripts/screenshots/sandbox/no-spawn.js")).guardedModule(
    load,
    "osTrigger",
  ),
);

/** What the scan finds that only shows once it is over, on Paquets. */
const SCANNED = "Visual Studio Code";
/** Only the Providers view shows it, once its port answered: a missing provider's install command. */
const PROVIDERS_LOADED = "npm install -g pnpm";
/** Only Planification shows it: the name of a fixture schedule. */
const SCHEDULE_NAME = SCHEDULES_FIXTURE[0]?.draft.name ?? "";
/** What the scripted install prints in the run view's pane. */
const INSTALL_OUTPUT = "Compiling ripgrep v15.0.0";
/** ripgrep's install, 41 s in and held until the capture is over. */
const RIPGREP_HELD: ScriptedInstall = {
  key: "cargo:ripgrep",
  output: INSTALL_OUTPUT,
  ms: 41_000,
  holds: true,
};
/**
 * Above captureScene's 10 s wait for a text, so a scene that cannot reach its
 * state fails with the frame dumped rather than a bare timeout; a loaded
 * machine gets the margin too.
 */
const CAPTURE_BUDGET_MS = 20_000;

let leaveSandbox: () => void;
let thaw: () => void;

beforeEach(() => {
  leaveSandbox = enterSandbox();
  thaw = freezeClock(FIXTURE_CLOCK.now);
});

afterEach(() => {
  thaw();
  leaveSandbox();
  spawnGuard.reset();
});

function sceneOf(play: Scene["play"], fixture: () => AppFixture = () => appFixture()): Scene {
  return {
    id: "test-scene",
    title: "gup — test",
    alt: "A test scene.",
    size: { cols: 100, rows: 28 },
    fixture,
    play,
  };
}

function textOf(frame: CapturedFrame): string {
  return frame.lines.map((line) => line.spans.map((span) => span.text).join("")).join("\n");
}

/** The fixture app, its Providers view answering only after `ms` of real time. */
function slowProviders(ms: number): AppFixture {
  const fixture = appFixture();
  const slow = providersView({
    status: () => new Promise((resolve) => setTimeout(() => resolve(PROVIDERS_FIXTURE), ms)),
  });
  return { ...fixture, views: fixture.views.map((view) => (view.id === slow.id ? slow : view)) };
}

/** ripgrep (the first package of the table) checked and updated: its install held. */
const RUN_RIPGREP: Scene["play"] = async (stage) => {
  await stage.waitForText(SCANNED);
  await stage.press("down", "space", "enter");
  await stage.waitForText("vont être mis à jour");
  await stage.press("o");
  await stage.waitForText(INSTALL_OUTPUT);
  await stage.tick();
  await stage.waitForText("00:41");
};

describe("captureScene", { timeout: CAPTURE_BUDGET_MS }, () => {
  it("captures the frame the scene brought the app to, at the scene's size", async () => {
    const frame = await captureScene(sceneOf((stage) => stage.waitForText(SCANNED)));
    expect([frame.cols, frame.rows]).toEqual([100, 28]);
    expect(textOf(frame)).toContain(SCANNED);
  });

  it("waits for what a view loads while the renderer sits idle", async () => {
    const play: Scene["play"] = async (stage) => {
      await stage.waitForText(SCANNED);
      await stage.open("providers");
      await stage.waitForText(PROVIDERS_LOADED);
    };
    const frame = await captureScene(sceneOf(play, () => slowProviders(300)));
    expect(textOf(frame)).toContain(PROVIDERS_LOADED);
  });

  it("opens each view a scene names through the sidebar, in the production order", async () => {
    const play: Scene["play"] = async (stage) => {
      await stage.waitForText(SCANNED);
      await stage.open("options");
      await stage.waitForText("Mode rapide");
      // Planification sits above Options in the sidebar: the walk goes back up.
      await stage.open("schedules");
      await stage.waitForText(SCHEDULE_NAME);
    };
    expect(textOf(await captureScene(sceneOf(play)))).toContain(SCHEDULE_NAME);
  });

  it("runs an update in the screen on its script, and leaves nothing routed after", async () => {
    const fixture = (): AppFixture => appFixture({ updates: [RIPGREP_HELD] });
    const frame = await captureScene(sceneOf(RUN_RIPGREP, fixture));
    // The frozen frame clock ticked once: the install's duration is the script's.
    expect(textOf(frame)).toContain(INSTALL_OUTPUT);
    await vi.waitFor(() => expect(activeInheritSink()).toBeNull());
    expect(spawnGuard.attempts).toEqual([]);
  });

  it("puts every startup slot back once the capture is over", async () => {
    const quiet = (): AppFixture => appFixture({ settings: { interface: { animations: false } } });
    await captureScene(sceneOf((stage) => stage.waitForText(SCANNED), quiet));
    expect(uiPreferences().current()).toBe(DEFAULT_UI_PREFERENCES);
    expect(launcherFactory()).toBe(outsideLauncher);
    expect(effectiveLogThreshold()).toBe("off");
  });

  it("ends the app and lets a held scan finish when the scene fails", async () => {
    const fixture = appFixture({ holdScan: { finished: 9, running: 2 } });
    const failing = sceneOf(async () => {
      throw new Error("the scene lost its way");
    }, () => fixture);
    await expect(captureScene(failing)).rejects.toThrow("the scene lost its way");
    await vi.waitFor(() => expect(fixture.state.detectedCount).toBe(14));
  });
});
