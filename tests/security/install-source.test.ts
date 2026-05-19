import { describe, expect, it } from "vitest";
import { inferSourceFromPath } from "../../src/core/install-source.js";

/**
 * inferSourceFromPath drives which package manager we trust to perform an
 * upgrade. A path classifier that can be fooled (e.g. by a substring match
 * occurring inside a user-controlled directory name) could cause us to invoke
 * the wrong PM. These tests pin behavior on the known signals and verify the
 * function does NOT misclassify obvious adversarial inputs.
 */
describe("inferSourceFromPath", () => {
  it("recognises scoop shims", () => {
    expect(inferSourceFromPath("C:\\Users\\me\\scoop\\shims\\foo.exe")).toBe("scoop");
    expect(inferSourceFromPath("D:\\TOOLS\\Scoop\\shims\\bar.exe")).toBe("scoop");
  });

  it("recognises chocolatey installs", () => {
    expect(inferSourceFromPath("C:\\ProgramData\\chocolatey\\bin\\foo.exe")).toBe(
      "choco",
    );
  });

  it("recognises winget / WindowsApps / user-scoped installs", () => {
    expect(
      inferSourceFromPath(
        "C:\\Users\\me\\AppData\\Local\\Microsoft\\WinGet\\Packages\\X\\foo.exe",
      ),
    ).toBe("winget");
    expect(inferSourceFromPath("C:\\Program Files\\WindowsApps\\foo\\foo.exe")).toBe(
      "winget",
    );
    expect(
      inferSourceFromPath("C:\\Users\\me\\AppData\\Local\\Programs\\foo\\foo.exe"),
    ).toBe("winget");
  });

  it("classifies arbitrary system paths as manual", () => {
    expect(inferSourceFromPath("C:\\Program Files\\Foo\\foo.exe")).toBe("manual");
    expect(inferSourceFromPath("/usr/local/bin/foo")).toBe("manual");
    expect(inferSourceFromPath("")).toBe("manual");
  });

  it("is not fooled by attacker-controlled folder names that don't match the segments", () => {
    // "scoopish" / "chocolatier" / "winget-like" must not collide with the real markers.
    expect(inferSourceFromPath("C:\\Users\\me\\scoopish\\foo.exe")).toBe("manual");
    // "chocolatey" is a substring match by design (any path containing it is choco),
    // so we only assert the unrelated "scoop" / "winget" guards are tight.
    expect(inferSourceFromPath("C:\\winget-clone\\foo.exe")).toBe("manual");
  });
});
