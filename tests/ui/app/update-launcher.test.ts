import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProviderScanResult, SelectedPackage } from "../../../src/core/types.js";
import type { UpdateReport } from "../../../src/core/update/update-report.js";
import { outsideLauncher } from "../../../src/ui/app/outside-launcher.js";
import {
  launcherFactory,
  setLauncherFactory,
  type LauncherContext,
  type LauncherFactory,
  type LaunchRequest,
} from "../../../src/ui/app/update-launcher.js";
import { bootMenu, EMPTY_REPORT } from "../../support/tui/menu-driver.js";

const pkg = (id: string) => ({ id, current: "1.0", latest: "2.0" });
const WINGET: ProviderScanResult = {
  providerId: "winget",
  available: true,
  packages: [pkg("Git.Git"), pkg("7zip.7zip")],
};

afterEach(() => {
  setLauncherFactory(null);
});

/** A launcher that hands its context to the test and runs nothing. */
function capturingLauncher() {
  const contexts: LauncherContext[] = [];
  const launches: Array<{ packages: readonly SelectedPackage[]; request?: LaunchRequest }> = [];
  const factory: LauncherFactory = (context) => {
    contexts.push(context);
    return {
      isRunning: false,
      launch: async (packages, request) => {
        launches.push({ packages, ...(request && { request }) });
        return null;
      },
    };
  };
  return { factory, contexts, launches };
}

function reportOf(succeeded: readonly string[]): UpdateReport {
  const entries = succeeded.map((id) => ({
    key: `winget:${id}`,
    providerId: "winget",
    outcome: { id, success: true },
  }));
  return { ...EMPTY_REPORT, entries, succeeded: entries.map((entry) => entry.outcome) };
}

describe("launcher slot", () => {
  it("runs updates outside the screen unless a module installed another launcher", () => {
    expect(launcherFactory()).toBe(outsideLauncher);
    const { factory } = capturingLauncher();
    setLauncherFactory(factory);
    expect(launcherFactory()).toBe(factory);
    setLauncherFactory(null);
    expect(launcherFactory()).toBe(outsideLauncher);
  });

  it("hands the installed launcher what Paquets launches", async () => {
    const launcher = capturingLauncher();
    const menu = await bootMenu({ scans: [WINGET], launcher: launcher.factory });
    await menu.waitForText("Git.Git");
    await menu.press("down", "space", "enter");
    expect(launcher.launches.map(({ packages }) => packages.map((p) => p.pkg.id))).toEqual([
      ["Git.Git"],
    ]);
  });
});

describe("outside launcher", () => {
  it("ends the session with the update to run, after a confirmation", async () => {
    const menu = await bootMenu({ scans: [WINGET] });
    await menu.waitForText("Git.Git");
    await menu.press("down", "space", "enter");
    expect(await menu.frame()).toContain("1 paquet(s) vont être mis à jour");
    await menu.press("o");
    const ended = await menu.exit;
    if (ended.kind !== "outside") throw new Error("expected an outside update");
    await expect(ended.run()).resolves.toBe(EMPTY_REPORT);
    expect(menu.controller.updateOutside).toHaveBeenCalledWith(
      [{ providerId: "winget", pkg: pkg("Git.Git") }],
      {},
    );
  });

  it("skips the confirmation when the preferences say so", async () => {
    const menu = await bootMenu({ scans: [WINGET], preferences: { confirmBeforeUpdate: false } });
    await menu.waitForText("Git.Git");
    await menu.press("down", "space", "enter");
    await expect(menu.exit).resolves.toMatchObject({ kind: "outside" });
  });

  it("carries the schedule and the view to come back to", async () => {
    const launcher = capturingLauncher();
    const menu = await bootMenu({ scans: [WINGET], launcher: launcher.factory });
    await menu.waitForText("Git.Git");
    const context = launcher.contexts[0]!;
    const unconfirmed = { ...context.preferences(), confirmBeforeUpdate: false };
    const outside = outsideLauncher({ ...context, preferences: () => unconfirmed });
    const request = { scheduleId: "s1", returnTo: "options" as const };
    const selection = [{ providerId: "winget", pkg: pkg("Git.Git") }];

    await expect(outside.launch(selection, request)).resolves.toBeNull();

    const ended = await menu.exit;
    expect(ended).toMatchObject({ kind: "outside", returnTo: "options" });
    if (ended.kind === "outside") await ended.run();
    expect(menu.controller.updateOutside).toHaveBeenCalledWith(expect.any(Array), request);
  });

  it("does nothing for an empty selection", async () => {
    const launcher = capturingLauncher();
    const menu = await bootMenu({ scans: [WINGET], launcher: launcher.factory });
    await menu.waitForText("Git.Git");
    await expect(outsideLauncher(launcher.contexts[0]!).launch([])).resolves.toBeNull();
    expect(await menu.frame()).not.toContain("vont être mis à jour");
  });

  it("neither asks nor leaves the screen while a scan of the menu runs", async () => {
    const launcher = capturingLauncher();
    const menu = await bootMenu({
      launcher: launcher.factory,
      controller: { scan: () => new Promise<void>(() => {}) },
    });
    const context = launcher.contexts[0]!;
    await vi.waitFor(() => expect(context.isScanning()).toBe(true));
    const selection = [{ providerId: "winget", pkg: pkg("Git.Git") }];

    await expect(outsideLauncher(context).launch(selection)).resolves.toBeNull();

    expect(await menu.frame()).not.toContain("vont être mis à jour");
    const ended = await Promise.race([menu.exit, Promise.resolve("still open")]);
    expect(ended).toBe("still open");
  });
});

describe("after an update inside the screen", () => {
  async function updatedInside(preferences: { rescanAfterUpdate: boolean }) {
    const launcher = capturingLauncher();
    const menu = await bootMenu({ scans: [WINGET], launcher: launcher.factory, preferences });
    await menu.waitForText("Git.Git");
    return { menu, context: launcher.contexts[0]! };
  }

  it("drops the updated packages and goes back to Paquets", async () => {
    const { menu, context } = await updatedInside({ rescanAfterUpdate: false });
    await menu.press("tab", "down", "down", "enter");
    context.afterUpdate(reportOf(["Git.Git"]));
    const text = await menu.frame();
    expect(text).toContain("┏━ Paquets");
    expect(text).toContain("7zip.7zip");
    expect(text).not.toContain("Git.Git");
    expect(menu.controller.scan).toHaveBeenCalledOnce();
  });

  it("goes back to the view the update was launched from", async () => {
    const { menu, context } = await updatedInside({ rescanAfterUpdate: false });
    context.afterUpdate(reportOf([]), "options");
    expect(await menu.frame()).toContain("┏━ Options");
  });

  it("rescans when the preferences ask for it", async () => {
    const { menu, context } = await updatedInside({ rescanAfterUpdate: true });
    context.afterUpdate(reportOf(["Git.Git"]));
    await vi.waitFor(() => expect(menu.controller.scan).toHaveBeenCalledTimes(2));
    expect(await menu.waitForText("Git.Git")).toContain("┏━ Paquets");
  });
});
