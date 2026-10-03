import { afterEach, describe, expect, it } from "vitest";
import { isSupportedOn } from "../../../src/core/platform/is-supported-on.js";
import { platformName, supportLabel } from "../../../src/core/platform/platform-label.js";
import { PLATFORMS } from "../../../src/core/platform/platforms.js";

const originalPlatform = process.platform;

function setPlatform(value: NodeJS.Platform): void {
  Object.defineProperty(process, "platform", { value, configurable: true });
}

afterEach(() => setPlatform(originalPlatform));

describe("PLATFORMS", () => {
  it("names the single-OS sets", () => {
    expect(PLATFORMS.windows).toEqual(["win32"]);
    expect(PLATFORMS.macos).toEqual(["darwin"]);
  });

  it("puts every platform but Windows in notWindows", () => {
    expect([...PLATFORMS.notWindows].sort()).toEqual([
      "aix", "android", "cygwin", "darwin", "freebsd", "haiku",
      "linux", "netbsd", "openbsd", "sunos",
    ]);
  });

  it("cannot be altered at runtime", () => {
    expect(Object.isFrozen(PLATFORMS)).toBe(true);
    expect(Object.isFrozen(PLATFORMS.notWindows)).toBe(true);
  });
});

describe("isSupportedOn", () => {
  it("supports a subject that declares no platform everywhere", () => {
    expect(isSupportedOn({}, "win32")).toBe(true);
    expect(isSupportedOn({}, "freebsd")).toBe(true);
  });

  it("supports a restricted subject only on the platforms it lists", () => {
    expect(isSupportedOn({ platforms: PLATFORMS.macos }, "darwin")).toBe(true);
    expect(isSupportedOn({ platforms: PLATFORMS.macos }, "linux")).toBe(false);
    expect(isSupportedOn({ platforms: PLATFORMS.notWindows }, "win32")).toBe(false);
  });

  it("reads the running platform at call time", () => {
    const windowsOnly = { platforms: PLATFORMS.windows };
    setPlatform("win32");
    expect(isSupportedOn(windowsOnly)).toBe(true);
    setPlatform("darwin");
    expect(isSupportedOn(windowsOnly)).toBe(false);
  });
});

describe("platformName", () => {
  it("names the three desktop platforms and keeps the raw id otherwise", () => {
    expect(platformName("win32")).toBe("Windows");
    expect(platformName("darwin")).toBe("macOS");
    expect(platformName("linux")).toBe("Linux");
    expect(platformName("freebsd")).toBe("freebsd");
  });
});

describe("supportLabel", () => {
  it("labels each named set", () => {
    expect(supportLabel(PLATFORMS.windows)).toBe("Windows uniquement");
    expect(supportLabel(PLATFORMS.macos)).toBe("macOS uniquement");
    expect(supportLabel(PLATFORMS.notWindows)).toBe("macOS/Linux uniquement");
  });

  it("lists named platforms in a fixed order whatever the declaration order", () => {
    expect(supportLabel(["linux", "darwin"])).toBe("macOS/Linux uniquement");
  });

  it("falls back to raw ids when the set names no desktop platform", () => {
    expect(supportLabel(["freebsd"])).toBe("freebsd uniquement");
  });
});
