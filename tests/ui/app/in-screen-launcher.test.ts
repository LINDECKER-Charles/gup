import { describe, expect, it, vi } from "vitest";
import type { EmbeddedTerminalSupport } from "../../../src/core/pty/pty-loader.js";
import { PTY_LABELS } from "../../../src/core/pty/pty-labels.js";
import type { OutdatedPackage } from "../../../src/core/types.js";
import type { UpdatePorts, UpdateRequest } from "../../../src/core/update/update-ports.js";
import { buildReport, type UpdateReport } from "../../../src/core/update/update-report.js";
import { inScreenLauncher } from "../../../src/ui/app/in-screen-launcher.js";
import type { UiPreferences } from "../../../src/ui/app/ui-preferences.js";
import { DIALOG_HINTS, PANEL_HINTS_TAIL } from "../../../src/ui/text/menu-labels.js";
import { LAUNCH_ERROR, RUN_TITLES } from "../../../src/ui/text/run-labels.js";
import { optionsView } from "../../../src/ui/views/options-view.js";
import { scanView } from "../../../src/ui/views/scan-view.js";
import { outcome, pkg, scan } from "../../support/builders.js";
import { fakePty } from "../../support/pty/fake-pty.js";
import {
  bootMenu,
  contextView,
  EMPTY_REPORT,
  type MenuDriver,
} from "../../support/tui/menu-driver.js";

/**
 * The in-screen launcher's decisions, with the pipeline scripted: what the
 * confirmation says, when the update leaves the screen instead, what happens
 * when it breaks. The run view itself is covered by tests/ui/run.
 */

const AVAILABLE: EmbeddedTerminalSupport = {
  isAvailable: true,
  pty: fakePty().module,
  trampoline: { script: "pty-exec.js", execArgv: [] },
};
const DISABLED: EmbeddedTerminalSupport = { isAvailable: false, reason: PTY_LABELS.disabled };
const SETTLE_MS = 10_000;
const POLL_MS = 10;

type Pipeline = (requests: readonly UpdateRequest[], ports: UpdatePorts) => Promise<UpdateReport>;

/** A pipeline that updates every request at once, telling the run view as it goes. */
const updatesEverything: Pipeline = async (requests, ports) => {
  const items = requests.map((request) => ({
    ...request,
    key: `${request.providerId}:${request.packageId}`,
    providerName: request.providerId,
  }));
  ports.observer.planned({ direct: items, elevated: [] });
  const entries = items.map((item) => {
    const result = outcome(item.packageId);
    ports.observer.started({ item });
    ports.observer.finished({ item, outcome: result, durationMs: 1 });
    return { key: item.key, providerId: item.providerId, outcome: result };
  });
  return buildReport(entries, []);
};

interface MenuOptions {
  readonly support?: EmbeddedTerminalSupport | (() => Promise<EmbeddedTerminalSupport>);
  readonly pipeline?: Pipeline;
  readonly packages?: readonly OutdatedPackage[];
  readonly preferences?: Partial<UiPreferences>;
}

async function menuWith(options: MenuOptions = {}) {
  const support = options.support ?? AVAILABLE;
  const loadSupport = vi.fn(typeof support === "function" ? support : async () => support);
  const runUpdates = vi.fn(options.pipeline ?? updatesEverything);
  const menu = await bootMenu({
    scans: [scan("winget", [...(options.packages ?? [pkg("Git.Git"), pkg("7zip.7zip")])])],
    launcher: inScreenLauncher({ loadSupport, runUpdates, platform: "win32" }),
    ...(options.preferences && { preferences: options.preferences }),
  });
  await shown(menu, "Git.Git");
  return { menu, loadSupport, runUpdates };
}

async function shown(menu: MenuDriver, text: string): Promise<string> {
  return vi.waitFor(
    async () => {
      const frame = await menu.frame();
      expect(frame).toContain(text);
      return frame;
    },
    { timeout: SETTLE_MS, interval: POLL_MS },
  );
}

/** The key-hint bar: the frame's last line, without its leading blank. */
function hintBar(frame: string): string {
  return (frame.trimEnd().split("\n").at(-1) ?? "").trim();
}

describe("in-screen launcher", () => {
  it("starts detecting the embedded terminal as soon as the menu opens", async () => {
    const { loadSupport } = await menuWith();
    expect(loadSupport).toHaveBeenCalled();
  });

  it("confirms with the admin packages tagged and the UAC prompt announced", async () => {
    const { menu, runUpdates } = await menuWith({
      packages: [pkg("Git.Git"), pkg("nodejs", { requiresAdmin: true })],
    });
    await menu.press("a", "enter");
    const confirmation = await shown(menu, "2 paquet(s) vont être mis à jour");
    expect(confirmation).toContain("• nodejs 1.0.0 → 2.0.0 (admin)");
    expect(confirmation).toContain("une invite UAC");
    await menu.press("o");
    await shown(menu, RUN_TITLES.done);
    expect(runUpdates).toHaveBeenCalledOnce();
    await menu.press("enter");
    expect(await shown(menu, "┏━ Paquets")).toContain("Tout est à jour.");
  });

  it("updates outside the screen when the embedded terminal is unavailable, saying why", async () => {
    const { menu, runUpdates } = await menuWith({ support: DISABLED });
    await menu.press("a", "enter");
    const confirmation = await shown(menu, "vont être mis à jour");
    expect(confirmation).toContain(`Terminal intégré indisponible (${PTY_LABELS.disabled})`);
    await menu.press("o");

    const ended = await menu.exit;
    if (ended.kind !== "outside") throw new Error("expected an update outside the screen");
    await expect(ended.run()).resolves.toBe(EMPTY_REPORT);
    expect(menu.controller.updateOutside).toHaveBeenCalledWith(
      [expect.objectContaining({ providerId: "winget" }), expect.anything()],
      {},
    );
    expect(runUpdates).not.toHaveBeenCalled();
  });

  it("runs nothing when the confirmation is declined", async () => {
    const { menu, runUpdates } = await menuWith();
    await menu.press("a", "enter", "n");
    expect(await shown(menu, "┏━ Paquets")).toContain("Git.Git");
    expect(runUpdates).not.toHaveBeenCalled();
  });

  it("starts at once when the preferences skip the confirmation", async () => {
    const { menu, runUpdates } = await menuWith({ preferences: { confirmBeforeUpdate: false } });
    await menu.press("a", "enter");
    await shown(menu, RUN_TITLES.done);
    expect(runUpdates).toHaveBeenCalledOnce();
  });

  it("starts one update for Entrée pressed twice while the terminal is being detected", async () => {
    let detected = (_support: EmbeddedTerminalSupport): void => {};
    const pending = new Promise<EmbeddedTerminalSupport>((resolve) => (detected = resolve));
    const { menu, runUpdates } = await menuWith({ support: () => pending });
    await menu.press("a", "enter", "enter");
    detected(AVAILABLE);
    await shown(menu, "vont être mis à jour");
    await menu.press("o");
    await shown(menu, RUN_TITLES.done);
    expect(runUpdates).toHaveBeenCalledOnce();
  });

  it("puts the confirmation's keys on the hint bar, though it opens after the detection", async () => {
    let detected = (_support: EmbeddedTerminalSupport): void => {};
    const pending = new Promise<EmbeddedTerminalSupport>((resolve) => (detected = resolve));
    const { menu } = await menuWith({ support: () => pending });
    await menu.press("a", "enter");
    expect(hintBar(await menu.frame())).toContain(PANEL_HINTS_TAIL);
    detected(AVAILABLE);
    const confirmation = await shown(menu, "vont être mis à jour");
    expect(hintBar(confirmation)).toBe(DIALOG_HINTS.confirm);
    await menu.press("n");
    expect(hintBar(await shown(menu, "┏━ Paquets"))).toContain(PANEL_HINTS_TAIL);
  });

  it("says the update broke and gives the menu back", async () => {
    const { menu } = await menuWith({
      pipeline: async () => {
        throw new Error("plus de place sur le disque");
      },
    });
    await menu.press("a", "enter", "o");
    expect(await shown(menu, LAUNCH_ERROR.title)).toContain("plus de place sur le disque");
    await menu.press("enter");
    const back = await shown(menu, "┏━ Paquets");
    expect(back).not.toContain(RUN_TITLES.running);
    expect(back).toContain("Git.Git");
  });

  it("gives a broken run-now back to Planification, without promising Paquets", async () => {
    const schedules = contextView();
    const menu = await bootMenu({
      views: [schedules.view, optionsView()],
      initialView: "schedules",
      scanOnStart: false,
      preferences: { confirmBeforeUpdate: false },
      launcher: inScreenLauncher({
        loadSupport: async () => AVAILABLE,
        runUpdates: async () => {
          throw new Error("plus de place sur le disque");
        },
      }),
    });
    await shown(menu, "planifications");
    const selection = [{ providerId: "winget", pkg: pkg("Git.Git") }];
    const launch = schedules.context().updates.launch(selection, { returnTo: "schedules" });

    const failure = await shown(menu, LAUNCH_ERROR.title);
    expect(failure).toContain(LAUNCH_ERROR.back);
    expect(failure).not.toContain("aux paquets");
    await menu.press("enter");
    await expect(launch).resolves.toBeNull();
    expect(await shown(menu, "┏━ Planification")).toContain("planifications");
  });

  it("carries a schedule's run-now to the history and goes back where it came from", async () => {
    const schedules = contextView();
    const runUpdates = vi.fn(updatesEverything);
    const menu = await bootMenu({
      views: [schedules.view, optionsView()],
      initialView: "schedules",
      scanOnStart: false,
      preferences: { confirmBeforeUpdate: false },
      launcher: inScreenLauncher({ loadSupport: async () => AVAILABLE, runUpdates }),
    });
    await shown(menu, "planifications");
    const selection = [{ providerId: "winget", pkg: pkg("Git.Git") }];
    const launch = schedules.context().updates.launch(selection, {
      scheduleId: "s1",
      returnTo: "options",
    });

    await shown(menu, RUN_TITLES.done);
    expect(runUpdates.mock.calls[0]![0]).toEqual([
      expect.objectContaining({ providerId: "winget", packageId: "Git.Git", scheduleId: "s1" }),
    ]);
    await menu.press("enter");
    await expect(launch).resolves.toMatchObject({ succeeded: [outcome("Git.Git")] });
    await shown(menu, "┏━ Options");
  });

  it("starts nothing while a scan of the menu runs", async () => {
    const schedules = contextView();
    const runUpdates = vi.fn(updatesEverything);
    const menu = await bootMenu({
      views: [schedules.view, scanView()],
      initialView: "schedules",
      controller: { scan: () => new Promise<void>(() => {}) },
      preferences: { confirmBeforeUpdate: false },
      launcher: inScreenLauncher({ loadSupport: async () => AVAILABLE, runUpdates }),
    });
    await shown(menu, "planifications");
    expect(schedules.context().isScanning()).toBe(true);
    const selection = [{ providerId: "winget", pkg: pkg("Git.Git") }];

    await expect(schedules.context().updates.launch(selection)).resolves.toBeNull();
    expect(runUpdates).not.toHaveBeenCalled();
    expect(await menu.frame()).not.toContain(RUN_TITLES.running);
  });
});
