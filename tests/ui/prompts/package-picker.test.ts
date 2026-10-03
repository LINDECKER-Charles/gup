import { describe, expect, it, vi } from "vitest";
import type { ProviderScanResult } from "../../../src/core/types.js";
import { pickPackages } from "../../../src/ui/prompts/package-picker.js";
import { createTestHost, frame, press } from "../tui-test-host.js";

const SCANS: ProviderScanResult[] = [
  {
    providerId: "winget",
    available: true,
    packages: [
      { id: "Git.Git", current: "2.51.0", latest: "2.52.0" },
      { id: "7zip.7zip", current: "25.00", latest: "25.01" },
    ],
  },
];

describe("pickPackages", () => {
  it("returns the packages checked in the table", async () => {
    vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const { host, next } = createTestHost();
    const picked = pickPackages(SCANS, () => "Winget", host);
    const screen = await next();
    expect(await frame(screen)).toContain("╭─ Paquets");
    await press(screen, "space", "enter");
    expect((await picked).map((p) => p.pkg.id)).toEqual(["Git.Git", "7zip.7zip"]);
  });

  it("returns nothing when left with q", async () => {
    vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const { host, next } = createTestHost();
    const picked = pickPackages(SCANS, () => "Winget", host);
    await press(await next(), "q");
    await expect(picked).resolves.toEqual([]);
  });
});
