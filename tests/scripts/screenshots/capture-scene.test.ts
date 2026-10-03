import type { CapturedFrame } from "@opentui/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { appFixture, type AppFixture } from "../../../scripts/screenshots/fixtures/app-fixture.js";
import { FIXTURE_CLOCK } from "../../../scripts/screenshots/fixtures/clock.js";
import { PROVIDERS_FIXTURE } from "../../../scripts/screenshots/fixtures/providers.js";
import { enterSandbox } from "../../../scripts/screenshots/sandbox/env-sandbox.js";
import { freezeClock } from "../../../scripts/screenshots/sandbox/frozen-clock.js";
import { captureScene } from "../../../scripts/screenshots/scenes/capture-scene.js";
import type { Scene } from "../../../scripts/screenshots/scenes/scene.js";
import { providersView } from "../../../src/ui/views/providers-view.js";

// The generator's setup, as scripts/screenshots/setup.ts installs it.
vi.mock("../../../src/core/runner.js", async (importOriginal) => {
  const { spawnGuard: guard } = await import("../../../scripts/screenshots/sandbox/no-spawn.js");
  return guard.guard(await importOriginal<typeof import("../../../src/core/runner.js")>());
});

/** What the scan finds that only shows once it is over, on Paquets. */
const SCANNED = "Visual Studio Code";

let leaveSandbox: () => void;
let thaw: () => void;

beforeEach(() => {
  leaveSandbox = enterSandbox();
  thaw = freezeClock(FIXTURE_CLOCK.now);
});

afterEach(() => {
  thaw();
  leaveSandbox();
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

describe("captureScene", () => {
  it("captures the frame the scene brought the app to, at the scene's size", async () => {
    const frame = await captureScene(sceneOf((stage) => stage.waitForText(SCANNED)));
    expect([frame.cols, frame.rows]).toEqual([100, 28]);
    expect(textOf(frame)).toContain(SCANNED);
  });

  it("waits for what a view loads while the renderer sits idle", async () => {
    const play: Scene["play"] = async (stage) => {
      await stage.waitForText(SCANNED);
      await stage.press("tab", "down", "enter");
      await stage.waitForText("Non installés");
    };
    const frame = await captureScene(sceneOf(play, () => slowProviders(300)));
    expect(textOf(frame)).toContain("Winget");
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
