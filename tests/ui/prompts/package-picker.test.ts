import { describe, expect, it, vi } from "vitest";
import type { ProviderScanResult } from "../../../src/core/types.js";
import { LAUNCH_NOTICES } from "../../../src/ui/text/packages-labels.js";
import { pickPackages } from "../../../src/ui/prompts/package-picker.js";
import { createTestHost, frame, press } from "../../support/tui/test-host.js";

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

async function openPicker() {
  vi.spyOn(process.stdout, "write").mockReturnValue(true);
  const { host, next } = createTestHost();
  const picked = pickPackages(SCANS, () => "Winget", host);
  return { picked, screen: await next() };
}

describe("pickPackages", () => {
  it("returns the packages checked in the table", async () => {
    const { picked, screen } = await openPicker();
    expect(await frame(screen)).toContain("╭─ Paquets");
    await press(screen, "space", "enter");
    expect((await picked).map((p) => p.pkg.id)).toEqual(["Git.Git", "7zip.7zip"]);
  });

  it("picks nothing on Entrée with nothing checked, and says how; a then Entrée takes all", async () => {
    const { picked, screen } = await openPicker();
    await press(screen, "down", "enter");
    const text = await frame(screen);
    expect(text).toContain(LAUNCH_NOTICES.empty);
    expect(text).toContain("q annuler");
    await press(screen, "a", "enter");
    expect((await picked).map((p) => p.pkg.id)).toEqual(["Git.Git", "7zip.7zip"]);
  });

  it("returns nothing when left with q", async () => {
    const { picked, screen } = await openPicker();
    await press(screen, "q");
    await expect(picked).resolves.toEqual([]);
  });
});
