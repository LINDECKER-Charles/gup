import { createTestRenderer } from "@opentui/core/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import { installConsole } from "../../../src/core/process/output-router.js";
import { canPrompt, createScreenHost } from "../../../src/ui/tui/screen-host.js";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

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
