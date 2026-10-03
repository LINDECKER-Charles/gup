import { createTestRenderer } from "@opentui/core/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import { installConsole } from "../../../src/core/process/output-router.js";
import { createScreenHost } from "../../../src/ui/tui/screen-host.js";

afterEach(() => {
  vi.restoreAllMocks();
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
