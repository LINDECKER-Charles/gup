import { describe, expect, it } from "vitest";
import { withScanView } from "../../../src/ui/tui/scan-view.js";
import { createTestHost, frame } from "../tui-test-host.js";

describe("withScanView", () => {
  it("draws detection, then the counter, the providers in flight and the last failure", async () => {
    const { host, next } = createTestHost();
    let release: () => void = () => {};
    let reportScan: () => void = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));

    const result = withScanView(async (progress) => {
      progress.detecting();
      await new Promise<void>((resolve) => (reportScan = resolve));
      progress.scanning({
        done: 3,
        total: 8,
        inFlight: ["winget", "scoop", "pip", "cargo", "gem"],
        lastError: "az : exit 1",
      });
      await gate;
      return "scanned";
    }, host);

    const screen = await next();
    expect(await frame(screen)).toContain("détection des providers");

    reportScan();
    await screen.waitForFrame((text) => text.includes("scan 3/8"));
    const text = await frame(screen);
    expect(text).toContain("winget · scoop · pip · cargo +1");
    expect(text).toContain("✖ az : exit 1");

    release();
    await expect(result).resolves.toBe("scanned");
    expect(screen.renderer.isDestroyed).toBe(true);
  });
});
