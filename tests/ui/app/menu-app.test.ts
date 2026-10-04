import { afterEach, describe, expect, it, vi } from "vitest";
import type { MenuState } from "../../../src/commands/menu-state.js";
import type { ProviderScanResult } from "../../../src/core/types.js";
import { MenuApp } from "../../../src/ui/app/menu-app.js";
import {
  DEFAULT_UI_PREFERENCES,
  setUiPreferencesSource,
  type UiPreferences,
} from "../../../src/ui/app/ui-preferences.js";
import { defaultViews, EMPTY_REPORT, scriptedController } from "../../support/tui/menu-driver.js";
import { createTestHost, frame, press } from "../../support/tui/test-host.js";

const pkg = (id: string) => ({ id, current: "1.0", latest: "2.0" });
const WINGET: ProviderScanResult = {
  providerId: "winget",
  available: true,
  packages: [pkg("Git.Git"), pkg("7zip.7zip")],
};

afterEach(() => {
  setUiPreferencesSource(null);
});

function withPreferences(patch: Partial<UiPreferences>): void {
  const current = { ...DEFAULT_UI_PREFERENCES, ...patch };
  setUiPreferencesSource({ current: () => current, subscribe: () => () => {} });
}

/** The app on a test terminal; Git.Git updates successfully whenever an update runs. */
function app() {
  const state: MenuState = { scans: [], fast: false, filter: [], detectedCount: 0, providers: [] };
  const controller = scriptedController([WINGET]);
  vi.mocked(controller.updateOutside).mockResolvedValue({
    ...EMPTY_REPORT,
    entries: [
      { key: "winget:Git.Git", providerId: "winget", outcome: { id: "Git.Git", success: true } },
    ],
  });
  const { host, next } = createTestHost();
  const pause = vi.fn(async () => {});
  const running = new MenuApp({ controller, state, views: defaultViews() }, { host, pause }).run();
  return { controller, pause, next, running };
}

/** In the first session: check Git.Git, launch, confirm. */
async function updateGit(next: ReturnType<typeof app>["next"]): Promise<void> {
  const screen = await next();
  await screen.waitForFrame((text) => text.includes("Git.Git"));
  await press(screen, "down", "space", "enter", "o");
}

describe("MenuApp", () => {
  it("opens on the preferred view, scanning only when asked to", async () => {
    withPreferences({ launchView: "options", scanOnLaunch: false });
    const { controller, next } = app();
    const screen = await next();
    expect(await frame(screen)).toContain("┏━ Options");
    expect(controller.scan).not.toHaveBeenCalled();
    await press(screen, "q");
  });

  it("comes back on Paquets without the updated packages, and without rescanning", async () => {
    const { controller, pause, next, running } = app();
    await updateGit(next);
    const back = await next();
    const text = await frame(back);
    expect(pause).toHaveBeenCalledOnce();
    expect(text).toContain("┏━ Paquets");
    expect(text).toContain("7zip.7zip");
    expect(text).not.toContain("Git.Git");
    expect(controller.scan).toHaveBeenCalledOnce();
    await press(back, "q");
    await expect(running).resolves.toBeUndefined();
  });

  it("rescans after an update when the preferences ask for it", async () => {
    withPreferences({ rescanAfterUpdate: true });
    const { controller, next } = app();
    await updateGit(next);
    const back = await next();
    await back.waitForFrame((text) => text.includes("Git.Git"));
    expect(controller.scan).toHaveBeenCalledTimes(2);
    await press(back, "q");
  });
});
