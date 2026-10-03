import { describe, expect, it } from "vitest";
import { BrewCaskProvider } from "../../../src/providers/os/brew-cask.js";
import { BrewProvider, parseBrewOutdated } from "../../../src/providers/os/brew.js";
import { system } from "../../support/system/fake-system.js";
import { BREW_FORMULAE_JSON } from "./posix.cases.js";

/**
 * Homebrew formulae and casks share one `brew outdated --json=v2` envelope:
 * one side per provider, the active keg last, and a payload garbled by a
 * broken install degrades to no rows.
 */

describe("parseBrewOutdated", () => {
  it("takes the highest installed keg when several are present", () => {
    const rows = parseBrewOutdated(BREW_FORMULAE_JSON, "formulae");
    expect(rows.find((row) => row.id === "php@8.3")?.current).toBe("8.3.32");
  });

  it("drops entries missing a name or a version instead of emitting junk", () => {
    const payload = JSON.stringify({
      formulae: [
        { installed_versions: ["1.0"], current_version: "2.0" },
        { name: "nope", installed_versions: ["1.0"] },
        { name: "nada", current_version: "2.0" },
        { name: "ok", installed_versions: ["1.0"], current_version: "2.0" },
      ],
    });
    expect(parseBrewOutdated(payload, "formulae")).toEqual([
      { id: "ok", name: "ok", current: "1.0", latest: "2.0" },
    ]);
  });

  it("returns [] when the requested side of the envelope is absent or not a list", () => {
    expect(parseBrewOutdated(JSON.stringify({ formulae: [] }), "casks")).toEqual([]);
    expect(parseBrewOutdated(JSON.stringify({ casks: "nope" }), "casks")).toEqual([]);
  });

  it("returns [] rather than throwing on a payload that is not JSON", () => {
    expect(parseBrewOutdated("==> Auto-updating Homebrew...", "formulae")).toEqual([]);
  });
});

describe("Homebrew availability", () => {
  it("never runs brew on Windows, even with a brew shim on PATH", async () => {
    // A `brew.cmd` forwarding into WSL is the wsl-brew provider's business.
    await system.load({ platform: "win32", bin: { brew: "C:\\tools\\brew.cmd" } });
    await expect(new BrewProvider().isAvailable()).resolves.toBe(false);
    await expect(new BrewCaskProvider().isAvailable()).resolves.toBe(false);
  });

  it("offers casks on macOS only — Linuxbrew rejects every cask command", async () => {
    await system.load({ platform: "linux", bin: { brew: "/home/linuxbrew/.linuxbrew/bin/brew" } });
    await expect(new BrewProvider().isAvailable()).resolves.toBe(true);
    await expect(new BrewCaskProvider().isAvailable()).resolves.toBe(false);
  });
});
