import { describe, it, expect } from "vitest";
import { inferSourceFromPath, upgradeNeedsRoot } from "../../src/core/install-source.js";

describe("upgradeNeedsRoot", () => {
  it("is true for a distro package the manager can name", () => {
    expect(upgradeNeedsRoot("apt", { apt: "pyenv" })).toBe(true);
    expect(upgradeNeedsRoot("dnf", { dnf: "dotnet-sdk-8.0" })).toBe(true);
  });

  it("is false when the distro has no package to upgrade (manual SKIP, no sudo)", () => {
    expect(upgradeNeedsRoot("dnf", { apt: "pyenv" })).toBe(false);
  });

  it("is false for managers that never run under sudo", () => {
    expect(upgradeNeedsRoot("brew", { brew: "pyenv" })).toBe(false);
    expect(upgradeNeedsRoot("winget", { winget: "Microsoft.DotNet.SDK.8" })).toBe(false);
    expect(upgradeNeedsRoot("manual", { apt: "pyenv" })).toBe(false);
  });
});

describe("inferSourceFromPath", () => {
  it("detects scoop shims", () => {
    expect(
      inferSourceFromPath("C:\\Users\\me\\scoop\\shims\\terraform.exe"),
    ).toBe("scoop");
  });

  it("detects chocolatey installs", () => {
    expect(
      inferSourceFromPath(
        "C:\\ProgramData\\chocolatey\\lib\\terraform\\tools\\terraform.exe",
      ),
    ).toBe("choco");
  });

  it("detects winget Local Programs installs", () => {
    expect(
      inferSourceFromPath(
        "C:\\Users\\me\\AppData\\Local\\Programs\\foo\\foo.exe",
      ),
    ).toBe("winget");
  });

  it("detects winget WindowsApps installs", () => {
    expect(
      inferSourceFromPath(
        "C:\\Program Files\\WindowsApps\\Foo.Bar_1.0_x64__abc\\foo.exe",
      ),
    ).toBe("winget");
  });

  it("detects winget Packages installs", () => {
    expect(
      inferSourceFromPath(
        "C:\\Users\\me\\AppData\\Local\\Microsoft\\WinGet\\Packages\\foo\\bin\\foo.exe",
      ),
    ).toBe("winget");
  });

  it("falls back to manual for unknown locations", () => {
    expect(inferSourceFromPath("C:\\tools\\bin\\foo.exe")).toBe("manual");
  });

  it("is case-insensitive", () => {
    expect(
      inferSourceFromPath("C:\\USERS\\ME\\SCOOP\\SHIMS\\GH.EXE"),
    ).toBe("scoop");
  });
});
