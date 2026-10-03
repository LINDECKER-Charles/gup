import { afterEach, describe, expect, it, vi } from "vitest";

const { loadEmbeddedTerminal } = vi.hoisted(() => ({ loadEmbeddedTerminal: vi.fn() }));
vi.mock("../../../src/core/pty/pty-loader.js", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  loadEmbeddedTerminal,
}));

import { embeddedTerminalModule } from "../../../src/commands/cli/embedded-terminal-module.js";
import { PTY_LABELS } from "../../../src/core/pty/pty-labels.js";
import { outsideLauncher } from "../../../src/ui/app/outside-launcher.js";
import { launcherFactory, setLauncherFactory } from "../../../src/ui/app/update-launcher.js";
import { TERMINAL_DIAGNOSTIC } from "../../../src/ui/text/run-labels.js";

afterEach(() => {
  setLauncherFactory(null);
});

describe("embeddedTerminalModule", () => {
  it("runs the menu's updates inside the screen, and leaves the other commands alone", async () => {
    await embeddedTerminalModule.beforeAction?.({ commandPath: "update", options: {} });
    expect(launcherFactory()).toBe(outsideLauncher);
    await embeddedTerminalModule.beforeAction?.({ commandPath: "", options: {} });
    expect(launcherFactory()).not.toBe(outsideLauncher);
    expect(loadEmbeddedTerminal).not.toHaveBeenCalled();
  });

  it("reports the embedded terminal in gup doctor", async () => {
    loadEmbeddedTerminal.mockResolvedValueOnce({ isAvailable: true });
    await expect(embeddedTerminalModule.diagnostics?.()).resolves.toEqual([
      { label: TERMINAL_DIAGNOSTIC.label, value: TERMINAL_DIAGNOSTIC.available, status: "ok" },
    ]);
  });

  it("tells a user's choice (GUP_PTY) from a problem, with the reason", async () => {
    loadEmbeddedTerminal.mockResolvedValueOnce({ isAvailable: false, reason: PTY_LABELS.disabled });
    const [off] = (await embeddedTerminalModule.diagnostics?.()) ?? [];
    expect(off).toMatchObject({ status: "off", value: expect.stringContaining(PTY_LABELS.disabled) });

    const helper = PTY_LABELS.spawnHelper("/opt/gup/node_modules/node-pty/spawn-helper");
    loadEmbeddedTerminal.mockResolvedValueOnce({ isAvailable: false, reason: helper });
    const [warn] = (await embeddedTerminalModule.diagnostics?.()) ?? [];
    expect(warn).toEqual({
      label: TERMINAL_DIAGNOSTIC.label,
      value: TERMINAL_DIAGNOSTIC.unavailable(helper),
      status: "warn",
    });
  });
});
