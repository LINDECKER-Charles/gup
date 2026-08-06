import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The macOS OS-level layer: Homebrew formulae, Homebrew casks, the Mac App
 * Store bridge, MacPorts — plus the Apple-system-Ruby guard that stops the
 * gem provider from flooding a Mac scan with SIP-locked stdlib gems.
 */

const { commandExistsMock, runMock, runInheritMock, whichFirstMock } = vi.hoisted(
  () => ({
    commandExistsMock: vi.fn(),
    runMock: vi.fn(),
    runInheritMock: vi.fn(),
    whichFirstMock: vi.fn(),
  }),
);

vi.mock("../../src/core/runner.js", () => ({
  commandExists: commandExistsMock,
  run: runMock,
  runInherit: runInheritMock,
  whichFirst: whichFirstMock,
  isElevated: vi.fn(),
}));

import { BrewProvider, parseBrewOutdated } from "../../src/providers/os/brew.js";
import { BrewCaskProvider } from "../../src/providers/os/brew-cask.js";
import { MasProvider, parseMasOutdated } from "../../src/providers/os/mas.js";
import {
  MacPortsProvider,
  parsePortOutdated,
} from "../../src/providers/os/macports.js";
import {
  GemProvider,
  isAppleSystemRuby,
} from "../../src/providers/lang-other/gem.js";

function mkRun(stdout: string, failed = false) {
  return { stdout, stderr: "", exitCode: failed ? 1 : 0, failed };
}

const ORIGINAL_PLATFORM = process.platform;

function setPlatform(value: NodeJS.Platform): void {
  Object.defineProperty(process, "platform", { value, configurable: true });
}

beforeEach(() => {
  commandExistsMock.mockReset();
  runMock.mockReset();
  runInheritMock.mockReset();
  whichFirstMock.mockReset();
});

afterEach(() => {
  setPlatform(ORIGINAL_PLATFORM);
});

// ---------------------------------------------------------------------------
// Homebrew formulae
// ---------------------------------------------------------------------------

const BREW_FORMULAE_JSON = JSON.stringify({
  formulae: [
    {
      name: "libnghttp2",
      installed_versions: ["1.69.0"],
      current_version: "1.70.0",
      pinned: false,
      pinned_version: null,
    },
    {
      name: "php@8.3",
      installed_versions: ["8.3.31", "8.3.32"],
      current_version: "8.3.33",
      pinned: false,
    },
    {
      name: "node",
      installed_versions: ["22.1.0"],
      current_version: "24.0.0",
      pinned: true,
    },
  ],
  casks: [],
});

describe("BrewProvider", () => {
  it("is available whenever brew is on PATH, on macOS and on Linuxbrew", async () => {
    commandExistsMock.mockResolvedValue(true);
    setPlatform("darwin");
    await expect(new BrewProvider().isAvailable()).resolves.toBe(true);
    setPlatform("linux");
    await expect(new BrewProvider().isAvailable()).resolves.toBe(true);
    expect(commandExistsMock).toHaveBeenCalledWith("brew");
  });

  it("is unavailable when brew is absent", async () => {
    commandExistsMock.mockResolvedValue(false);
    await expect(new BrewProvider().isAvailable()).resolves.toBe(false);
  });

  it("scans formulae only, and asks brew for the v2 envelope", async () => {
    runMock.mockResolvedValueOnce(mkRun(BREW_FORMULAE_JSON));
    const rows = await new BrewProvider().listOutdated();
    expect(runMock).toHaveBeenCalledWith("brew", [
      "outdated",
      "--formula",
      "--json=v2",
    ]);
    expect(rows).toEqual([
      { id: "libnghttp2", name: "libnghttp2", current: "1.69.0", latest: "1.70.0" },
      { id: "php@8.3", name: "php@8.3", current: "8.3.32", latest: "8.3.33" },
      {
        id: "node",
        name: "node",
        current: "22.1.0",
        latest: "24.0.0",
        note: "pinned",
      },
    ]);
  });

  it("takes the highest installed keg when several are present", async () => {
    const rows = parseBrewOutdated(BREW_FORMULAE_JSON, "formulae");
    expect(rows.find((r) => r.id === "php@8.3")?.current).toBe("8.3.32");
  });

  it("returns [] when brew fails with no output", async () => {
    runMock.mockResolvedValueOnce(mkRun("", true));
    await expect(new BrewProvider().listOutdated()).resolves.toEqual([]);
  });

  it("returns [] rather than throwing on a garbled payload", async () => {
    runMock.mockResolvedValueOnce(mkRun("==> Auto-updating Homebrew..."));
    await expect(new BrewProvider().listOutdated()).resolves.toEqual([]);
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

  it("accepts the singular installed_version form", () => {
    const payload = JSON.stringify({
      casks: [{ name: "iterm2", installed_version: "3.4.0", current_version: "3.5.0" }],
    });
    expect(parseBrewOutdated(payload, "casks")).toEqual([
      { id: "iterm2", name: "iterm2", current: "3.4.0", latest: "3.5.0" },
    ]);
  });

  it("returns [] when the requested side of the envelope is absent", () => {
    expect(parseBrewOutdated(JSON.stringify({ formulae: [] }), "casks")).toEqual([]);
    expect(parseBrewOutdated(JSON.stringify({ casks: "nope" }), "casks")).toEqual([]);
  });

  it("updates one formula explicitly", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new BrewProvider().update("helm");
    expect(runInheritMock).toHaveBeenCalledWith("brew", [
      "upgrade",
      "--formula",
      "helm",
    ]);
    expect(res).toEqual({ id: "helm", success: true });
  });

  it("updates everything through a single resolution pass", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new BrewProvider().updateAll([
      { id: "a", current: "1", latest: "2" },
      { id: "b", current: "1", latest: "2" },
    ]);
    expect(runInheritMock).toHaveBeenCalledTimes(1);
    expect(runInheritMock).toHaveBeenCalledWith("brew", ["upgrade", "--formula"]);
    expect(res).toEqual([
      { id: "a", success: true },
      { id: "b", success: true },
    ]);
  });

  it("propagates a bulk failure to every package", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun("", true));
    const res = await new BrewProvider().updateAll([{ id: "a", current: "1", latest: "2" }]);
    expect(res).toEqual([{ id: "a", success: false }]);
  });

  it("does nothing for an empty set", async () => {
    await expect(new BrewProvider().updateAll([])).resolves.toEqual([]);
    expect(runInheritMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Homebrew casks
// ---------------------------------------------------------------------------

describe("BrewCaskProvider", () => {
  it("is macOS-only — Linuxbrew rejects every cask command", async () => {
    commandExistsMock.mockResolvedValue(true);
    setPlatform("linux");
    await expect(new BrewCaskProvider().isAvailable()).resolves.toBe(false);
    setPlatform("win32");
    await expect(new BrewCaskProvider().isAvailable()).resolves.toBe(false);
    expect(commandExistsMock).not.toHaveBeenCalled();
    setPlatform("darwin");
    await expect(new BrewCaskProvider().isAvailable()).resolves.toBe(true);
  });

  it("scans casks and parses the casks side of the envelope", async () => {
    runMock.mockResolvedValueOnce(
      mkRun(
        JSON.stringify({
          formulae: [],
          casks: [
            {
              name: "iterm2",
              installed_versions: ["3.4.23"],
              current_version: "3.5.0",
            },
          ],
        }),
      ),
    );
    const rows = await new BrewCaskProvider().listOutdated();
    expect(runMock).toHaveBeenCalledWith("brew", ["outdated", "--cask", "--json=v2"]);
    expect(rows).toEqual([
      { id: "iterm2", name: "iterm2", current: "3.4.23", latest: "3.5.0" },
    ]);
  });

  it("returns [] when brew fails with no output", async () => {
    runMock.mockResolvedValueOnce(mkRun("", true));
    await expect(new BrewCaskProvider().listOutdated()).resolves.toEqual([]);
  });

  it("upgrades through the cask path", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    await new BrewCaskProvider().update("iterm2");
    expect(runInheritMock).toHaveBeenCalledWith("brew", ["upgrade", "--cask", "iterm2"]);
  });

  it("bulk-upgrades casks in one command", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new BrewCaskProvider().updateAll([
      { id: "iterm2", current: "1", latest: "2" },
    ]);
    expect(runInheritMock).toHaveBeenCalledWith("brew", ["upgrade", "--cask"]);
    expect(res).toEqual([{ id: "iterm2", success: true }]);
  });

  it("does nothing for an empty set", async () => {
    await expect(new BrewCaskProvider().updateAll([])).resolves.toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Mac App Store
// ---------------------------------------------------------------------------

describe("MasProvider", () => {
  it("is macOS-only", async () => {
    commandExistsMock.mockResolvedValue(true);
    setPlatform("linux");
    await expect(new MasProvider().isAvailable()).resolves.toBe(false);
    setPlatform("darwin");
    await expect(new MasProvider().isAvailable()).resolves.toBe(true);
    expect(commandExistsMock).toHaveBeenCalledWith("mas");
  });

  it("parses the App Store id as the update target", () => {
    expect(parseMasOutdated("497799835 Xcode (14.2 -> 14.3)")).toEqual([
      { id: "497799835", name: "Xcode", current: "14.2", latest: "14.3" },
    ]);
  });

  it("tolerates the arrow variants shipped across mas releases", () => {
    expect(parseMasOutdated("1 A (1.0 → 2.0)")[0]?.latest).toBe("2.0");
    expect(parseMasOutdated("1 A (1.0 < 2.0)")[0]?.latest).toBe("2.0");
  });

  it("keeps multi-word app names intact", () => {
    expect(parseMasOutdated("409183694 Keynote for Mac (12.2.1 -> 13.0)")).toEqual([
      { id: "409183694", name: "Keynote for Mac", current: "12.2.1", latest: "13.0" },
    ]);
  });

  it("ignores blank lines and anything that is not an app row", () => {
    expect(parseMasOutdated("\n\nWarning: something\n")).toEqual([]);
  });

  it("returns [] when mas fails", async () => {
    runMock.mockResolvedValueOnce(mkRun("", true));
    await expect(new MasProvider().listOutdated()).resolves.toEqual([]);
  });

  it("upgrades one app by id and all apps in bulk", async () => {
    runInheritMock.mockResolvedValue(mkRun(""));
    await new MasProvider().update("497799835");
    expect(runInheritMock).toHaveBeenLastCalledWith("mas", ["upgrade", "497799835"]);
    await new MasProvider().updateAll([{ id: "497799835", current: "1", latest: "2" }]);
    expect(runInheritMock).toHaveBeenLastCalledWith("mas", ["upgrade"]);
  });

  it("does nothing for an empty set", async () => {
    await expect(new MasProvider().updateAll([])).resolves.toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// MacPorts
// ---------------------------------------------------------------------------

describe("MacPortsProvider", () => {
  it("is macOS-only", async () => {
    commandExistsMock.mockResolvedValue(true);
    setPlatform("linux");
    await expect(new MacPortsProvider().isAvailable()).resolves.toBe(false);
    setPlatform("darwin");
    await expect(new MacPortsProvider().isAvailable()).resolves.toBe(true);
    expect(commandExistsMock).toHaveBeenCalledWith("port");
  });

  it("parses the port table and skips the header", () => {
    const stdout = [
      "The following installed ports are outdated:",
      "gettext                        0.21_0 < 0.22_1",
      "libiconv                       1.16_1 < 1.17_0",
    ].join("\n");
    expect(parsePortOutdated(stdout)).toEqual([
      { id: "gettext", name: "gettext", current: "0.21_0", latest: "0.22_1" },
      { id: "libiconv", name: "libiconv", current: "1.16_1", latest: "1.17_0" },
    ]);
  });

  it("returns [] on the nothing-to-do message", () => {
    expect(parsePortOutdated("No installed ports are outdated.")).toEqual([]);
  });

  it("goes through sudo for every write, non-interactively", async () => {
    runInheritMock.mockResolvedValue(mkRun(""));
    await new MacPortsProvider().update("gettext");
    expect(runInheritMock).toHaveBeenLastCalledWith("sudo", [
      "port",
      "-N",
      "upgrade",
      "gettext",
    ]);
    await new MacPortsProvider().updateAll([{ id: "gettext", current: "1", latest: "2" }]);
    expect(runInheritMock).toHaveBeenLastCalledWith("sudo", [
      "port",
      "-N",
      "upgrade",
      "outdated",
    ]);
  });

  it("returns [] when port fails", async () => {
    runMock.mockResolvedValueOnce(mkRun("", true));
    await expect(new MacPortsProvider().listOutdated()).resolves.toEqual([]);
  });

  it("does nothing for an empty set", async () => {
    await expect(new MacPortsProvider().updateAll([])).resolves.toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Apple system Ruby guard
// ---------------------------------------------------------------------------

describe("isAppleSystemRuby", () => {
  it("is never true off macOS — Windows and Linux keep the previous behaviour", async () => {
    setPlatform("win32");
    whichFirstMock.mockResolvedValue("C:\\Ruby33-x64\\bin\\gem");
    await expect(isAppleSystemRuby()).resolves.toBe(false);
    expect(whichFirstMock).not.toHaveBeenCalled();

    setPlatform("linux");
    await expect(isAppleSystemRuby()).resolves.toBe(false);
  });

  it("detects Apple's frozen interpreter", async () => {
    setPlatform("darwin");
    whichFirstMock.mockResolvedValue("/usr/bin/gem");
    await expect(isAppleSystemRuby()).resolves.toBe(true);

    whichFirstMock.mockResolvedValue(
      "/System/Library/Frameworks/Ruby.framework/Versions/2.6/usr/bin/gem",
    );
    await expect(isAppleSystemRuby()).resolves.toBe(true);
  });

  it("leaves every managed Ruby alone", async () => {
    setPlatform("darwin");
    for (const path of [
      "/opt/homebrew/bin/gem",
      "/usr/local/bin/gem",
      "/Users/me/.rbenv/shims/gem",
      "/Users/me/.rvm/rubies/ruby-3.3.0/bin/gem",
      "/Users/me/.asdf/shims/gem",
    ]) {
      whichFirstMock.mockResolvedValue(path);
      await expect(isAppleSystemRuby()).resolves.toBe(false);
    }
  });

  it("is conservative when the path cannot be resolved", async () => {
    setPlatform("darwin");
    whichFirstMock.mockResolvedValue(null);
    await expect(isAppleSystemRuby()).resolves.toBe(false);
  });
});

describe("GemProvider availability", () => {
  it("hides itself on a Mac running Apple's system Ruby", async () => {
    setPlatform("darwin");
    commandExistsMock.mockResolvedValue(true);
    whichFirstMock.mockResolvedValue("/usr/bin/gem");
    await expect(new GemProvider().isAvailable()).resolves.toBe(false);
  });

  it("stays available for a Homebrew or rbenv Ruby", async () => {
    setPlatform("darwin");
    commandExistsMock.mockResolvedValue(true);
    whichFirstMock.mockResolvedValue("/opt/homebrew/bin/gem");
    await expect(new GemProvider().isAvailable()).resolves.toBe(true);
  });

  it("never runs the guard when gem is absent", async () => {
    commandExistsMock.mockResolvedValue(false);
    await expect(new GemProvider().isAvailable()).resolves.toBe(false);
    expect(whichFirstMock).not.toHaveBeenCalled();
  });
});
