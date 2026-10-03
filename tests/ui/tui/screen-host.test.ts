import type { CliRenderer } from "@opentui/core";
import { createTestRenderer } from "@opentui/core/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import { installLogBackend } from "../../../src/core/log/log.js";
import { installConsole } from "../../../src/core/process/output-router.js";
import type { AppearanceFactory } from "../../../src/ui/theme/appearance.js";
import { legacyAppearance } from "../../../src/ui/theme/legacy-appearance.js";
import { Chrome } from "../../../src/ui/tui/chrome.js";
import { PromptCancelledError } from "../../../src/ui/tui/prompt-cancelled.js";
import {
  canPrompt,
  configureScreens,
  createScreenHost,
} from "../../../src/ui/tui/screen-host.js";
import { createTestHost, press } from "../../support/tui/test-host.js";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  configureScreens(null);
  installLogBackend(null);
});

/** A host on OpenTUI's in-memory renderer that remembers the renderer it created. */
function recordingHost(createAppearance?: AppearanceFactory) {
  const created: CliRenderer[] = [];
  const host = createScreenHost(async () => {
    const { renderer } = await createTestRenderer({ exitOnCtrlC: false, exitSignals: [] });
    created.push(renderer);
    return renderer;
  }, createAppearance);
  return { host, renderer: () => created.at(-1) };
}

function captureWarnings(): string[] {
  const events: string[] = [];
  installLogBackend({ isEnabled: () => true, emit: (_level, event) => events.push(event) });
  return events;
}

describe("canPrompt", () => {
  const streams = [process.stdin, process.stdout];
  const saved = streams.map((stream) => Object.getOwnPropertyDescriptor(stream, "isTTY"));

  afterEach(() => {
    streams.forEach((stream, i) => {
      const descriptor = saved[i];
      if (descriptor) Object.defineProperty(stream, "isTTY", descriptor);
      else delete (stream as { isTTY?: boolean }).isTTY;
    });
  });

  function onTerminal(isTTY: boolean): void {
    for (const stream of streams) {
      Object.defineProperty(stream, "isTTY", { value: isTTY, configurable: true, writable: true });
    }
  }

  it("needs a terminal on both ends", () => {
    onTerminal(true);
    expect(canPrompt()).toBe(true);
    onTerminal(false);
    expect(canPrompt()).toBe(false);
  });

  it("refuses to prompt in an unattended run, even on a terminal", () => {
    onTerminal(true);
    vi.stubEnv("GUP_NONINTERACTIVE", "1");
    expect(canPrompt()).toBe(false);
  });
});

describe("screen host and the output router", () => {
  it("holds gup's own lines back while a screen is mounted, not after", async () => {
    const stdout = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    // A held line is queued for the exit: keep the hook off the test worker.
    vi.spyOn(process, "once").mockReturnValue(process);
    const host = createScreenHost(async () => (await createTestRenderer({})).renderer);

    await host.run(async () => {
      installConsole.log("pendant l'écran");
    });
    installConsole.log("après l'écran");

    const written = stdout.mock.calls.map((call) => String(call[0]));
    expect(written).not.toContain("pendant l'écran\n");
    expect(written).toContain("après l'écran\n");
  });

  it("releases the screen flag even when the mount throws", async () => {
    const stdout = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const host = createScreenHost(async () => (await createTestRenderer({})).renderer);

    await expect(
      host.run(async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    installConsole.log("visible");

    expect(stdout).toHaveBeenCalledWith("visible\n");
  });
});

describe("screen host and the appearance", () => {
  it("settles the appearance before the renderer is destroyed", async () => {
    const settled: boolean[] = [];
    const { host, renderer } = recordingHost((r, tui) => ({
      ...legacyAppearance(r, tui),
      dispose: async () => void settled.push(r.isDestroyed),
    }));

    await host.run(async () => {});

    expect(settled).toEqual([false]);
    expect(renderer()?.isDestroyed).toBe(true);
  });

  it("falls back to the legacy look when the factory throws, and still releases the terminal", async () => {
    const warnings = captureWarnings();
    const { host, renderer } = recordingHost(() => {
      throw new Error("palette");
    });

    const accent = await host.run(async (screen) => screen.appearance.style("accent").fg?.slot);

    expect(accent).toBe(6);
    expect(renderer()?.isDestroyed).toBe(true);
    expect(warnings).toEqual(["ui.appearance-failed"]);
  });

  it("destroys the renderer even when settling the appearance fails", async () => {
    const warnings = captureWarnings();
    const { host, renderer } = recordingHost((r, tui) => ({
      ...legacyAppearance(r, tui),
      dispose: () => Promise.reject(new Error("OSC")),
    }));

    await host.run(async () => {});

    expect(renderer()?.isDestroyed).toBe(true);
    expect(warnings).toEqual(["ui.appearance-dispose-failed"]);
  });

  it("opens later screens with the appearance configured at startup", async () => {
    const { host } = recordingHost();
    configureScreens({
      createAppearance: (r, tui) => ({ ...legacyAppearance(r, tui), density: "compact" }),
    });
    await expect(host.run(async (screen) => screen.appearance.density)).resolves.toBe("compact");
    configureScreens(null);
    await expect(host.run(async (screen) => screen.appearance.density)).resolves.toBe(
      "comfortable",
    );
  });
});

describe("Ctrl+C on a screen", () => {
  it("goes to the latest interception until it is released, then cancels", async () => {
    const { host, next } = createTestHost();
    const heard: string[] = [];
    let releases: Array<() => void> = [];
    const run = host.run((screen) => {
      new Chrome(screen);
      releases = [
        screen.interceptCtrlC(() => heard.push("first")),
        screen.interceptCtrlC(() => heard.push("second")),
      ];
      return new Promise<void>(() => {});
    });
    const setup = await next();

    await press(setup, "ctrl+c");
    releases[1]?.();
    releases[1]?.();
    await press(setup, "ctrl+c");
    releases[0]?.();
    await press(setup, "ctrl+c");

    expect(heard).toEqual(["second", "first"]);
    await expect(run).rejects.toBeInstanceOf(PromptCancelledError);
  });
});
