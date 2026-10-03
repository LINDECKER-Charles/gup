import * as fsPromises from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  compareBuilds,
  detectSourceFromPath,
  JetBrainsProvider,
} from "../../../src/providers/ide/jetbrains.js";
import { replaceForTest } from "../../support/system/boundary-spy.js";
import { system } from "../../support/system/fake-system.js";
import { installArgvs } from "../../support/system/trace.js";
import {
  ideMachine,
  jetbrainsRelease,
  MAC_BUNDLE,
  MAC_ROOTS,
  macBundleMachine,
  TOOLBOX_SKIP,
  WEBSTORM_2024_1,
  WEBSTORM_DIRS,
  WIN_ROOTS,
  webstormIn,
} from "./jetbrains.cases.js";

/**
 * How the JetBrains provider finds an IDE (a product-info.json somewhere under
 * a channel's root) and who owns it (the install path, resolved through links
 * on macOS).
 */

const listed = () => new JetBrainsProvider().listOutdated();

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

  it("orders an empty build before any other, whichever side it is on", () => {
    expect(compareBuilds("", "241.0")).toBeLessThan(0);
    expect(compareBuilds("241.0", "")).toBeGreaterThan(0);
  });
});

describe("detectSourceFromPath", () => {
  it.each([
    ["C:\\Users\\me\\AppData\\Local\\JetBrains\\Toolbox\\apps\\IDEA-U\\ch-0\\242.0", "toolbox"],
    ["C:\\Users\\me\\scoop\\apps\\webstorm\\current", "scoop"],
    ["C:\\ProgramData\\chocolatey\\lib\\webstorm\\tools\\WebStorm-242.0", "choco"],
    ["C:\\Users\\me\\AppData\\Local\\Microsoft\\WinGet\\Packages\\JetBrains.WebStorm_8wekyb3d8bbwe", "winget"],
    ["C:\\Users\\me\\AppData\\Local\\Programs\\WebStorm 2024.2", "winget"],
    ["C:\\Program Files\\JetBrains\\WebStorm 2024.2", "manual"],
    ["C:\\USERS\\ME\\SCOOP\\APPS\\WEBSTORM\\CURRENT", "scoop"],
    [
      "/Users/me/Library/Application Support/JetBrains/Toolbox/apps/WebStorm/ch-0/241/WebStorm.app",
      "toolbox",
    ],
    ["/opt/homebrew/Caskroom/webstorm/2024.1.0/WebStorm.app/Contents/Resources", "brew"],
    ["/usr/local/Caskroom/goland/2024.1/GoLand.app", "brew"],
    ["/Applications/WebStorm.app", "manual"],
  ])("classifies %s as %s", (path, source) => {
    expect(detectSourceFromPath(path)).toBe(source);
  });
});

describe("JetBrainsProvider.isAvailable", () => {
  it.each(Object.values(WIN_ROOTS))("detects an IDE root at %s on Windows", async (root) => {
    await system.load({ platform: "win32", fs: { [root]: { kind: "dir" } } });
    await expect(new JetBrainsProvider().isAvailable()).resolves.toBe(true);
  });

  it.each(Object.values(MAC_ROOTS))("detects an IDE root at %s on macOS", async (root) => {
    await system.load({ platform: "darwin", fs: { [root]: { kind: "dir" } } });
    await expect(new JetBrainsProvider().isAvailable()).resolves.toBe(true);
  });

  it("probes only the macOS roots on a Mac, whatever the environment says", async () => {
    const windowsLike = { LOCALAPPDATA: "C:\\Users\\me\\AppData\\Local" };
    await system.load({ platform: "darwin", env: windowsLike });
    await expect(new JetBrainsProvider().isAvailable()).resolves.toBe(false);
    expect(system.trace.fsReads).toEqual(Object.values(MAC_ROOTS));
  });

  it("drops the per-user roots of Windows when their variables are unset", async () => {
    await system.load({ platform: "win32", env: { LOCALAPPDATA: "", USERPROFILE: "" } });
    await expect(new JetBrainsProvider().isAvailable()).resolves.toBe(false);
    expect(system.trace.fsReads).toEqual([WIN_ROOTS.programFiles, WIN_ROOTS.programFilesX86]);
  });
});

describe("JetBrainsProvider.listOutdated — the product-info walk", () => {
  it("lists nothing, and asks nothing, when no root holds an IDE", async () => {
    await system.load({ platform: "win32" });
    await expect(listed()).resolves.toEqual([]);
    expect(system.trace.requests).toEqual([]);
  });

  it("lists nothing when the installed build is the latest one", async () => {
    const latest = { ...WEBSTORM_2024_1, buildNumber: "242.20224.300" };
    const installs = [[WEBSTORM_DIRS.toolbox, latest]] as const;
    await system.load(ideMachine({ platform: "win32", installs }));
    await expect(listed()).resolves.toEqual([]);
  });

  it("keeps the newest product-info found inside one product tree", async () => {
    const product = `${WIN_ROOTS.toolbox}\\IDEA-U`;
    const idea = { name: "IDEA", productCode: "IU" };
    await system.load(
      ideMachine({
        platform: "win32",
        installs: [
          [product, { ...idea, version: "2024.1", buildNumber: "241.0.0" }],
          [`${product}\\ch-0`, { ...idea, version: "2024.2", buildNumber: "242.0.0" }],
          [`${product}\\ch-1`, { ...idea, version: "2024.3", buildNumber: "243.0.0" }],
        ],
        http: [jetbrainsRelease("IU", "244.0.0", "2024.4")],
      }),
    );
    await expect(listed()).resolves.toMatchObject([{ id: "IU", current: "2024.3" }]);
  });

  it("keeps the newest build of a product across roots, with that install's source", async () => {
    const newer = { ...WEBSTORM_2024_1, version: "2024.2.0", buildNumber: "242.0.0" };
    await system.load(
      ideMachine({
        platform: "win32",
        installs: [
          [WEBSTORM_DIRS.toolbox, WEBSTORM_2024_1],
          [WEBSTORM_DIRS.winget, newer],
        ],
        http: [jetbrainsRelease("WS", "242.10.0", "2024.2.1")],
      }),
    );
    const rows = await listed();
    expect(rows).toEqual([
      { id: "WS", name: "WebStorm", current: "2024.2.0", latest: "2024.2.1", note: "via winget" },
    ]);
  });

  it("walks past files and unreadable entries", async () => {
    const product = `${WIN_ROOTS.toolbox}\\WebStorm`;
    await system.load(
      ideMachine({
        platform: "win32",
        installs: [[product, WEBSTORM_2024_1]],
        fs: { [`${product}\\bin.txt`]: { kind: "file" }, [`${product}\\locked`]: { kind: "dir" } },
      }),
    );
    system.inject({ on: "fs", path: `${product}\\locked`, mode: "eacces" });
    await expect(listed()).resolves.toMatchObject([{ id: "WS", current: "2024.1.0" }]);
  });

  it("skips a root it cannot read", async () => {
    await system.load(webstormIn("toolbox"));
    system.inject({ on: "fs", path: WIN_ROOTS.toolbox, mode: "eacces" });
    await expect(listed()).resolves.toEqual([]);
    expect(system.trace.requests).toEqual([]);
  });

  it.each([
    ["malformed", "{not valid json"],
    ["incomplete", JSON.stringify({ name: "WebStorm" })],
  ])("ignores a %s product-info.json", async (_label, content) => {
    const installs = [[WEBSTORM_DIRS.toolbox, content]] as const;
    await system.load(ideMachine({ platform: "win32", installs }));
    await expect(listed()).resolves.toEqual([]);
    expect(system.trace.requests).toEqual([]);
  });

  it("lists nothing when the release feed has no release of the product", async () => {
    const empty = { ...jetbrainsRelease("WS", "0", "0"), json: { WS: [] } };
    const installs = [[WEBSTORM_DIRS.toolbox, WEBSTORM_2024_1]] as const;
    await system.load(ideMachine({ platform: "win32", installs, http: [empty] }));
    await expect(listed()).resolves.toEqual([]);
  });
});

describe("JetBrainsProvider.listOutdated — macOS bundles", () => {
  it("enters a bundle only through Contents/Resources", async () => {
    await system.load(macBundleMachine());
    await listed();
    const walked = system.trace.fsReads;
    expect(walked).toContain(`${MAC_BUNDLE}/Contents/Resources/product-info.json`);
    for (const pruned of ["WebStorm.app/Contents/MacOS", "WebStorm.app/Contents/Frameworks"]) {
      expect(walked.filter((path) => path.includes(pruned))).toEqual([]);
    }
    expect(walked.filter((path) => path.includes("Xcode.app/Contents/Developer"))).toEqual([]);
  });

  it("keeps the bundle path, and calls the install manual, when realpath fails", async () => {
    await system.load(macBundleMachine());
    replaceForTest(fsPromises, "realpath", async () => {
      throw new Error("EACCES");
    });
    await expect(listed()).resolves.toMatchObject([{ id: "WS", note: "manuel", manual: true }]);
  });

  it("leaves a bundle that resolves into Toolbox's apps to Toolbox", async () => {
    const toolboxBundle = `${MAC_ROOTS.toolbox}/WebStorm/ch-0/241/WebStorm.app`;
    await system.load(macBundleMachine(toolboxBundle));
    await expect(listed()).resolves.toMatchObject([{ note: "via Toolbox", manual: true }]);
    await expect(new JetBrainsProvider().update("WS")).resolves.toEqual({
      id: "WS",
      success: false,
      skipped: true,
      message: TOOLBOX_SKIP,
    });
    expect(installArgvs()).toEqual([]);
  });
});

describe("JetBrainsProvider.update", () => {
  it("fails, and says so, when the IDE is no longer installed", async () => {
    await system.load({ platform: "win32" });
    await expect(new JetBrainsProvider().update("WS")).resolves.toEqual({
      id: "WS",
      success: false,
      message: "IDE WS introuvable — re-scanner ?",
    });
  });

  it("sends an unknown product to the catalogue's download page", async () => {
    const mystery = { name: "Mystery", version: "1.0", buildNumber: "100.0", productCode: "XX" };
    const dir = `${WIN_ROOTS.programFiles}\\Mystery`;
    await system.load(ideMachine({ platform: "win32", installs: [[dir, mystery]] }));
    await expect(new JetBrainsProvider().update("XX")).resolves.toMatchObject({
      skipped: true,
      message: "Installation manuelle — https://www.jetbrains.com/products/download/",
    });
  });

  it("skips an unknown product scoop installed, for want of a package id", async () => {
    const custom = { name: "Custom", version: "1.0.0", buildNumber: "100.0.0", productCode: "XX" };
    const dir = `${WIN_ROOTS.scoop}\\custom`;
    await system.load(ideMachine({ platform: "win32", installs: [[dir, custom]] }));
    await expect(new JetBrainsProvider().update("XX")).resolves.toEqual({
      id: "XX",
      success: false,
      skipped: true,
      message: "Pas de mapping scoop pour XX.",
    });
    expect(installArgvs()).toEqual([]);
  });
});
