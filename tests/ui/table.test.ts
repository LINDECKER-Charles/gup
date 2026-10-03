import chalk from "chalk";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PLATFORMS } from "../../src/core/platform/platforms.js";
import { renderProvidersStatus } from "../../src/ui/table.js";

/**
 * The doctor listing's wording is covered through `gup doctor`
 * (tests/commands/doctor.test.ts); this pins its layout details: incompatible
 * rows dimmed end to end, badges in one column.
 */
const DIM_ON = "\x1b[2m";
const DIM_OFF = "\x1b[22m";

let level: typeof chalk.level;

beforeEach(() => {
  level = chalk.level;
  chalk.level = 1;
});

afterEach(() => {
  chalk.level = level;
});

describe("renderProvidersStatus", () => {
  it("dims every incompatible row as a whole, and no detected one", () => {
    const out = renderProvidersStatus({
      platform: "darwin",
      detected: [{ id: "npm-g", displayName: "npm (global)" }],
      missing: [],
      incompatible: [
        { id: "winget", displayName: "Winget", platforms: PLATFORMS.windows },
        { id: "scoop", displayName: "Scoop", platforms: PLATFORMS.windows },
      ],
    });
    const rows = out.split("\n");
    const incompatible = rows.filter((row) => row.includes("Windows uniquement"));
    expect(incompatible).toHaveLength(2);
    for (const row of incompatible) {
      expect(row.startsWith(DIM_ON) && row.endsWith(DIM_OFF)).toBe(true);
    }
    const detected = rows.find((row) => row.includes("npm (global)"));
    expect(detected?.startsWith(DIM_ON)).toBe(false);
  });

  it("keeps the badges aligned past a name wider than the usual column", () => {
    chalk.level = 0;
    const out = renderProvidersStatus({
      platform: "win32",
      detected: [],
      missing: [],
      incompatible: [
        { id: "brew", displayName: "Homebrew", platforms: PLATFORMS.notWindows },
        { id: "xcodes", displayName: "xcodes (Xcode version manager)", platforms: PLATFORMS.macos },
      ],
    });
    const badgeColumns = out
      .split("\n")
      .filter((row) => row.endsWith("uniquement"))
      .map((row) => row.search(/(macOS|Windows)\S* uniquement$/));
    expect(badgeColumns).toHaveLength(2);
    expect(new Set(badgeColumns).size).toBe(1);
  });
});
