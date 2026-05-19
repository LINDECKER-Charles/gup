import { describe, it, expect } from "vitest";
import {
  compareBuilds,
  detectSourceFromPath,
} from "../../src/providers/ide/jetbrains.js";

describe("compareBuilds", () => {
  it("compares numerically segment by segment", () => {
    expect(compareBuilds("241.15989.150", "241.15989.150")).toBe(0);
    expect(compareBuilds("241.15989.150", "241.15989.160")).toBeLessThan(0);
    expect(compareBuilds("242.0.0", "241.99999.99999")).toBeGreaterThan(0);
  });

  it("treats missing segments as 0", () => {
    expect(compareBuilds("241.10", "241.10.0")).toBe(0);
    expect(compareBuilds("241.10.1", "241.10")).toBeGreaterThan(0);
  });

  it("treats empty strings as smallest / largest sentinel", () => {
    expect(compareBuilds("", "241.0")).toBeLessThan(0);
    expect(compareBuilds("241.0", "")).toBeGreaterThan(0);
  });
});

describe("detectSourceFromPath", () => {
  it("recognizes Toolbox installs", () => {
    expect(
      detectSourceFromPath(
        "C:\\Users\\me\\AppData\\Local\\JetBrains\\Toolbox\\apps\\IDEA-U\\ch-0\\242.0",
      ),
    ).toBe("toolbox");
  });

  it("recognizes scoop apps", () => {
    expect(
      detectSourceFromPath("C:\\Users\\me\\scoop\\apps\\webstorm\\current"),
    ).toBe("scoop");
  });

  it("recognizes chocolatey installs", () => {
    expect(
      detectSourceFromPath(
        "C:\\ProgramData\\chocolatey\\lib\\webstorm\\tools\\WebStorm-242.0",
      ),
    ).toBe("choco");
  });

  it("recognizes winget installs (Packages or Local Programs)", () => {
    expect(
      detectSourceFromPath(
        "C:\\Users\\me\\AppData\\Local\\Microsoft\\WinGet\\Packages\\JetBrains.WebStorm_Microsoft.Winget.Source_8wekyb3d8bbwe",
      ),
    ).toBe("winget");
    expect(
      detectSourceFromPath(
        "C:\\Users\\me\\AppData\\Local\\Programs\\WebStorm 2024.2",
      ),
    ).toBe("winget");
  });

  it("falls back to manual for unknown locations", () => {
    expect(
      detectSourceFromPath("C:\\Program Files\\JetBrains\\WebStorm 2024.2"),
    ).toBe("manual");
  });

  it("is case-insensitive", () => {
    expect(
      detectSourceFromPath("C:\\USERS\\ME\\SCOOP\\APPS\\WEBSTORM\\CURRENT"),
    ).toBe("scoop");
  });
});
