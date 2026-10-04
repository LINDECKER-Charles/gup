import { describe, expect, it } from "vitest";
import { PLATFORMS } from "../../../src/core/platform/platforms.js";
import type { ProviderStatusReport } from "../../../src/core/platform/types.js";
import { defaultViews, bootMenu } from "../../support/tui/menu-driver.js";
import { providersView } from "../../../src/ui/views/providers-view.js";

const WINDOWS_REPORT: ProviderStatusReport = {
  platform: "win32",
  detected: [{ id: "winget", displayName: "Winget", platforms: PLATFORMS.windows }],
  missing: [{ id: "choco", displayName: "Chocolatey", platforms: PLATFORMS.windows }],
  incompatible: [{ id: "brew-cask", displayName: "Homebrew (casks)", platforms: PLATFORMS.macos }],
};

describe("providersView", () => {
  it("shows the providers of another OS greyed, with where they run", async () => {
    const menu = await bootMenu({ providers: WINDOWS_REPORT, initialView: "providers" });
    const frame = await menu.waitForText("Incompatibles avec Windows (1)");
    expect(frame).toContain("1 détecté(s) · 1 non installé(s) · 1 incompatible(s) avec Windows");
    expect(frame).toMatch(/– Homebrew \(casks\) +brew-cask +macOS uniquement/);
  });

  it("follows the show-incompatible preference without reloading", async () => {
    const menu = await bootMenu({
      providers: WINDOWS_REPORT,
      initialView: "providers",
      preferences: { showIncompatibleProviders: false },
    });
    expect(await menu.waitForText("1 non installé(s)")).not.toContain("brew-cask");
    menu.setPreferences({ showIncompatibleProviders: true });
    expect(await menu.waitForText("brew-cask")).toContain("Incompatibles avec Windows (1)");
  });

  it("shows empty groups when detection fails", async () => {
    const failing = providersView({ status: () => Promise.reject(new Error("probe")) });
    const views = [...defaultViews().filter((view) => view.id !== "providers"), failing];
    const menu = await bootMenu({ views, initialView: "providers" });
    const frame = await menu.waitForText("Détectés (0)");
    expect(frame).toContain("Non installés / hors PATH (0)");
    expect(frame).not.toContain("Incompatibles");
  });
});
