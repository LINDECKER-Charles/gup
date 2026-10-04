import chalk from "chalk";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PLATFORMS } from "../../src/core/platform/platforms.js";
import { getProvider } from "../../src/core/registry.js";
import { renderProvidersStatus, renderScanTable } from "../../src/ui/table.js";
import { pkg, scan } from "../support/builders.js";
import { useLocale } from "../support/locale.js";

/**
 * The two tables of the one-shot commands. `gup list`'s scan table: one row
 * per update, providers in id order under their display name, a provider's
 * scan error on its own row, the total underneath. The doctor listing's
 * wording is covered through `gup doctor` (tests/commands/doctor.test.ts);
 * this pins its layout details: incompatible rows dimmed end to end, badges
 * in one column.
 */
const DIM_ON = "\x1b[2m";
const DIM_OFF = "\x1b[22m";
/** cli-table3 colours its borders itself, whatever chalk's level. */
const ANSI = new RegExp(String.raw`\x1b\[[0-9;]*m`, "g");

let level: typeof chalk.level;

beforeEach(() => {
  level = chalk.level;
  chalk.level = 1;
});

afterEach(() => {
  chalk.level = level;
});

describe("renderScanTable", () => {
  /** The table's rows, cells trimmed, borders and colours left out. */
  function rowsOf(table: string): string[][] {
    return table
      .replace(ANSI, "")
      .split("\n")
      .filter((line) => line.includes("│"))
      .map((line) => line.split("│").slice(1, -1).map((cell) => cell.trim()));
  }

  beforeEach(() => {
    chalk.level = 0;
  });

  it("lists every update, providers in id order under their display name", () => {
    const out = renderScanTable([
      scan("winget", [pkg("Git.Git", { name: "Git", current: "2.51.0", latest: "2.52.0" })]),
      scan("npm-g", [pkg("typescript", { note: "via corepack" }), pkg("pnpm")]),
    ]);
    const npm = getProvider("npm-g")!.displayName;
    const winget = getProvider("winget")!.displayName;
    expect(rowsOf(out)).toEqual([
      ["Provider", "Package", "Current", "Latest", "Note"],
      [npm, "typescript", "1.0.0", "2.0.0", "via corepack"],
      [npm, "pnpm", "1.0.0", "2.0.0", ""],
      [winget, "Git", "2.51.0", "2.52.0", ""],
    ]);
    expect(out.split("\n").at(-1)?.trim()).toBe("3 mise(s) à jour disponible(s)");
  });

  it("shows a provider's scan error in its row, and leaves it out of the total", () => {
    const out = renderScanTable([
      scan("az", [], { error: "Please run 'az login'" }),
      scan("pip", [pkg("requests")]),
    ]);
    expect(rowsOf(out)).toContainEqual([
      getProvider("az")!.displayName,
      "scan error: Please run 'az login'",
      "",
      "",
      "",
    ]);
    expect(out).toContain("1 mise(s) à jour disponible(s)");
  });

  it("names an unregistered provider by its id", () => {
    expect(rowsOf(renderScanTable([scan("ghost", [pkg("x")])]))[1]?.[0]).toBe("ghost");
  });

  it("says everything is up to date instead of an empty table", () => {
    expect(renderScanTable([scan("pip"), scan("az")])).toBe(
      "  à jour — aucune mise à jour disponible",
    );
  });

  // A registry answering 503 left npm's scan empty: "à jour" was a lie.
  it("shows the scan errors, never `à jour`, when nothing else is outdated", () => {
    const out = renderScanTable([scan("pip"), scan("npm-g", [], { error: "npm outdated a échoué" })]);
    expect(out).not.toContain("à jour —");
    expect(rowsOf(out)).toContainEqual([
      getProvider("npm-g")!.displayName,
      "scan error: npm outdated a échoué",
      "",
      "",
      "",
    ]);
    expect(out.split("\n").at(-1)?.trim()).toBe("0 mise(s) à jour disponible(s)");
  });

  describe("in English", () => {
    useLocale("en");

    it("says it is up to date, or counts the updates, in English", () => {
      expect(renderScanTable([scan("pip")])).toBe("  up to date — no update available");
      const out = renderScanTable([scan("npm-g", [pkg("typescript")])]);
      expect(out.split("\n").at(-1)?.trim()).toBe("1 update available");
      expect(rowsOf(out)[0]).toEqual(["Provider", "Package", "Current", "Latest", "Note"]);
    });
  });
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
