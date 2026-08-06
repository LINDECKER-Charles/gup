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

  it("recognises the three real Homebrew prefixes", () => {
    // Apple Silicon prefix is brew-exclusive: any binary under it is brew's.
    expect(inferSourceFromPath("/opt/homebrew/bin/kubectl")).toBe("brew");
    expect(
      inferSourceFromPath("/opt/homebrew/Cellar/kubernetes-cli/1.36.3/bin/kubectl"),
    ).toBe("brew");
    expect(inferSourceFromPath("/opt/homebrew/Caskroom/docker/4.30.0/docker")).toBe(
      "brew",
    );
    // Intel prefix is shared with hand-installs, so it only counts under a keg root.
    expect(inferSourceFromPath("/usr/local/Cellar/helm/3.15.0/bin/helm")).toBe("brew");
    expect(inferSourceFromPath("/usr/local/Caskroom/iterm2/3.5.0/iterm2")).toBe("brew");
    // Linuxbrew, system-wide and per-user.
    expect(inferSourceFromPath("/home/linuxbrew/.linuxbrew/bin/helm")).toBe("brew");
    expect(inferSourceFromPath("/home/me/.linuxbrew/bin/helm")).toBe("brew");
  });

  it("does not hand /usr/local hand-installs to brew", () => {
    // The single most common false positive: /usr/local/bin is where a curl-
    // installed binary lands. Routing `brew upgrade` at it would upgrade a
    // different copy of the tool than the one on PATH.
    expect(inferSourceFromPath("/usr/local/bin/kubectl")).toBe("manual");
    expect(inferSourceFromPath("/usr/local/opt/foo/bin/foo")).toBe("manual");
  });

  it("is not fooled by a Cellar/Caskroom segment outside a Homebrew prefix", () => {
    // A user directory named "cellar" must not be mistaken for a keg root.
    expect(inferSourceFromPath("/home/me/cellar/bin/foo")).toBe("manual");
    expect(inferSourceFromPath("/Users/me/Caskroom/foo")).toBe("manual");
    expect(inferSourceFromPath("/tmp/cellar/foo")).toBe("manual");
    // Nor a lookalike prefix.
    expect(inferSourceFromPath("/opt/homebrew-fake/bin/foo")).toBe("manual");
    expect(inferSourceFromPath("/home/linuxbrewery/bin/foo")).toBe("manual");
  });

  it("never classifies a Windows path as a POSIX package manager", () => {
    // The brew/apt/dnf patterns are forward-slash anchored by construction.
    expect(inferSourceFromPath("C:\\Tools\\Cellar\\foo.exe")).toBe("manual");
    expect(inferSourceFromPath("C:\\opt\\homebrew\\bin\\foo.exe")).toBe("manual");
    expect(inferSourceFromPath("D:\\Caskroom\\foo.exe")).toBe("manual");
  });
});
