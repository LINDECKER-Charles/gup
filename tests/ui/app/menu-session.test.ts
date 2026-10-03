import { describe, expect, it, vi } from "vitest";
import type { MenuState } from "../../../src/commands/menu-state.js";
import { MenuSession, type MenuController } from "../../../src/ui/app/menu-session.js";
import { createTestHost, frame, press } from "../../support/tui/test-host.js";

const pkg = (id: string, current: string, latest: string) => ({ id, current, latest });

function setup() {
  const state: MenuState = { scans: [], fast: false, filter: [], detectedCount: 0, providers: [] };
  const controller: MenuController = {
    scan: vi.fn(async (s: MenuState, events) => {
      events.detecting();
      events.planned(1);
      events.started("Winget");
      events.finished("Winget", { updates: 2, ms: 1000 });
      events.completed(1000);
      s.scans = [
        {
          providerId: "winget",
          available: true,
          packages: [pkg("Git.Git", "2.51.0", "2.52.0"), pkg("7zip.7zip", "25.00", "25.01")],
        },
      ];
      s.detectedCount = 1;
    }),
    providersStatus: vi.fn(async () => ({
      detected: [{ id: "winget", displayName: "Winget" }],
      missing: [{ id: "brew", displayName: "Homebrew" }],
    })),
    updatePackages: vi.fn(async () => {}),
    updateTargets: vi.fn(async () => {}),
    validateTargets: (raw) => (raw.includes(":") ? true : "format provider:package"),
    displayName: () => "Winget",
  };
  const { host, next } = createTestHost({ size: { cols: 110, rows: 26 } });
  const exit = host.run((screen) =>
    new MenuSession(screen, { state, controller, scanOnStart: true }).run(),
  );
  return { state, controller, exit, next };
}

async function ready(next: () => ReturnType<ReturnType<typeof createTestHost>["next"]>) {
  const screen = await next();
  await screen.waitForFrame((text) => text.includes("Git.Git"));
  return screen;
}

describe("MenuSession", () => {
  it("scans on start, then lands on the package table", async () => {
    const { exit, next } = setup();
    const screen = await ready(next);
    const text = await frame(screen);
    expect(text).toContain("┏━ Paquets");
    expect(text).toContain("2 mise(s) à jour");
    await press(screen, "q");
    await expect(exit).resolves.toEqual({ kind: "quit" });
  });

  it("updates the checked packages once confirmed, outside the screen", async () => {
    const { controller, exit, next } = setup();
    const screen = await ready(next);
    await press(screen, "down", "down", "space", "enter");
    expect(await frame(screen)).toContain("1 paquet(s) vont être mis à jour");
    await press(screen, "o");
    const ended = await exit;
    expect(ended.kind).toBe("outside");
    expect(controller.updatePackages).not.toHaveBeenCalled();
    if (ended.kind === "outside") await ended.run();
    const picked = vi.mocked(controller.updatePackages).mock.calls[0]![0];
    expect(picked.map((p) => p.pkg.id)).toEqual(["7zip.7zip"]);
  });

  it("keeps the session open when the update is declined", async () => {
    const { controller, next } = setup();
    const screen = await ready(next);
    await press(screen, "down", "enter", "n");
    const text = await frame(screen);
    expect(text).not.toContain("vont être mis à jour");
    expect(text).toContain("┏━ Paquets");
    expect(controller.updatePackages).not.toHaveBeenCalled();
    await press(screen, "q");
  });

  it("navigates the sidebar and loads the providers view on demand", async () => {
    const { controller, next } = setup();
    const screen = await ready(next);
    await press(screen, "tab", "down", "down", "down");
    await screen.waitForFrame((text) => text.includes("Homebrew"));
    expect(controller.providersStatus).toHaveBeenCalledOnce();
    const text = await frame(screen);
    expect(text).toContain("╭─ Providers");
    expect(text).toContain("┏━ Menu");
    await press(screen, "q");
  });

  it("asks for a target, refuses a malformed one, then runs it outside the screen", async () => {
    const { controller, exit, next } = setup();
    const screen = await ready(next);
    await press(screen, "tab", "down", "down", "enter");
    await new Promise((resolve) => setTimeout(resolve, 10));
    // The Enter that opened the dialog must not reach the field and submit it empty.
    expect(await frame(screen)).not.toContain("format provider:package");
    await screen.mockInput.typeText("nope");
    await press(screen, "enter");
    expect(await frame(screen)).toContain("format provider:package");
    for (let i = 0; i < 4; i++) screen.mockInput.pressBackspace();
    await screen.mockInput.typeText("winget:Git.Git");
    await press(screen, "enter");
    const ended = await exit;
    if (ended.kind === "outside") await ended.run();
    expect(controller.updateTargets).toHaveBeenCalledWith(["winget:Git.Git"]);
  });
});
