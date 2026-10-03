import { describe, expect, it } from "vitest";
import * as runner from "../../../src/core/runner.js";
import {
  isXcodesUpgrade,
  parseXcodesVersion,
  XcodesProvider,
} from "../../../src/providers/embedded-mobile/xcodes.js";
import { replaceForTest } from "../../support/system/boundary-spy.js";
import { system } from "../../support/system/fake-system.js";
import type { SimPlatform } from "../../support/system/types.js";
import { installArgvs, probeArgvs } from "../../support/system/trace.js";
import { XCODES_VERSION_ARGV, xcodesMachine } from "./embedded-mobile.cases.js";

/**
 * xcodes, the Xcode version manager: the binary only, never the multi-gigabyte
 * Xcode downloads behind an Apple ID it manages. `xcodes update` refreshes
 * that catalogue and is never what gup runs.
 */

describe("XcodesProvider.isAvailable", () => {
  it.each<SimPlatform>(["win32", "linux"])(
    "is macOS-only, and does not even probe the binary on %s",
    async (platform) => {
      await system.load({ platform, bin: { xcodes: "/usr/local/bin/xcodes" } });
      const probe = replaceForTest(runner, "commandExists", () => Promise.resolve(true));
      await expect(new XcodesProvider().isAvailable()).resolves.toBe(false);
      expect(probe).not.toHaveBeenCalled();
    },
  );

  it("is unavailable rather than throwing when the probe blows up", async () => {
    await system.load(xcodesMachine("2.0.3"));
    replaceForTest(runner, "commandExists", () => Promise.reject(new Error("PATH exploded")));
    await expect(new XcodesProvider().isAvailable()).resolves.toBe(false);
  });
});

describe("parseXcodesVersion", () => {
  it("reads the bare semver `xcodes version` prints", () => {
    expect(parseXcodesVersion("2.0.3")).toBe("2.0.3");
    expect(parseXcodesVersion("2.0.3\n")).toBe("2.0.3");
  });

  it("tolerates a decorated line (leading v, tool name, `version` word)", () => {
    expect(parseXcodesVersion("v2.0.3")).toBe("2.0.3");
    expect(parseXcodesVersion("xcodes 2.0.3")).toBe("2.0.3");
    expect(parseXcodesVersion("xcodes version 2.0.3")).toBe("2.0.3");
    expect(parseXcodesVersion("2.1")).toBe("2.1");
    expect(parseXcodesVersion("2.1.0-beta.1")).toBe("2.1.0-beta.1");
  });

  it("strips SGR colour codes before matching the anchored line", () => {
    expect(parseXcodesVersion("\u001b[32m2.0.3\u001b[0m")).toBe("2.0.3");
  });

  it("skips a first-run notice printed above the answer", () => {
    const stdout = "Migrating cache to ~/Library/Caches/com.xcodesorg.xcodes\n2.0.3\n";
    expect(parseXcodesVersion(stdout)).toBe("2.0.3");
  });

  it("refuses a bare integer, a year, blank and garbage input", () => {
    expect(parseXcodesVersion("2")).toBeNull();
    expect(parseXcodesVersion("2024")).toBeNull();
    expect(parseXcodesVersion("")).toBeNull();
    expect(parseXcodesVersion("   \n\n  ")).toBeNull();
    expect(parseXcodesVersion("error: no such subcommand 'version'")).toBeNull();
  });

  it("refuses a line that carries anything besides the version", () => {
    expect(parseXcodesVersion("xcodes 2.0.3 (build 42)")).toBeNull();
  });

  it("keeps a build-metadata suffix and survives CRLF line endings", () => {
    expect(parseXcodesVersion("2.0.3+sha.abc123")).toBe("2.0.3+sha.abc123");
    expect(parseXcodesVersion("warning: cache\r\n2.0.3\r\n")).toBe("2.0.3");
  });
});

describe("isXcodesUpgrade", () => {
  it("only fires when the published core is strictly newer", () => {
    expect(isXcodesUpgrade("2.0.3", "2.0.4")).toBe(true);
    expect(isXcodesUpgrade("2.0.3", "2.0.3")).toBe(false);
    expect(isXcodesUpgrade("2.1.0", "2.0.3")).toBe(false);
  });

  it("sorts 2.10 above 2.9 instead of comparing as strings", () => {
    expect(isXcodesUpgrade("2.9.0", "2.10.0")).toBe(true);
    expect(isXcodesUpgrade("2.10.0", "2.9.0")).toBe(false);
  });

  it("compares missing trailing segments as zero", () => {
    expect(isXcodesUpgrade("2.0", "2.0.1")).toBe(true);
    expect(isXcodesUpgrade("2.0.0", "2.0")).toBe(false);
  });

  it("lets the release supersede the pre-release built from it, never the reverse", () => {
    expect(isXcodesUpgrade("2.1.0-beta.1", "2.1.0")).toBe(true);
    expect(isXcodesUpgrade("2.1.0", "2.1.0-beta.1")).toBe(false);
    expect(isXcodesUpgrade("2.1.0-beta.2", "2.1.0-beta.1")).toBe(false);
  });

  it("treats an unparseable segment as zero rather than throwing", () => {
    expect(isXcodesUpgrade("main", "1.0.0")).toBe(true);
    expect(isXcodesUpgrade("1.0.0", "main")).toBe(false);
  });

  it("stays quiet between two pre-releases of the same core", () => {
    expect(isXcodesUpgrade("2.1.0-beta.1", "2.1.0-beta.1")).toBe(false);
    // A newer core still wins, pre-release or not.
    expect(isXcodesUpgrade("2.0.0-beta.1", "2.1.0-beta.1")).toBe(true);
  });
});

describe("XcodesProvider.listOutdated", () => {
  it("asks `xcodes version` only — never `xcodes update`, the catalogue refresh", async () => {
    await system.load(xcodesMachine("2.0.3"));
    await new XcodesProvider().listOutdated();
    expect(probeArgvs().filter((argv) => argv[0] === "xcodes")).toEqual([XCODES_VERSION_ARGV]);
    expect(installArgvs()).toEqual([]);
  });

  it("asks GitHub nothing when the version line is unrecognised", async () => {
    await system.load(xcodesMachine("OVERVIEW: Manage the Xcodes installed"));
    await expect(new XcodesProvider().listOutdated()).resolves.toEqual([]);
    expect(system.trace.requests).toEqual([]);
  });

  it("probes no install source when nothing is behind", async () => {
    await system.load(xcodesMachine("2.1.0"));
    await expect(new XcodesProvider().listOutdated()).resolves.toEqual([]);
    expect(probeArgvs()).toEqual([XCODES_VERSION_ARGV]);
  });

  it("returns [] rather than throwing when the spawn is rejected", async () => {
    await system.load(xcodesMachine("2.0.3"));
    system.inject({ on: "spawn", argv: XCODES_VERSION_ARGV, mode: "rejects" });
    await expect(new XcodesProvider().listOutdated()).resolves.toEqual([]);
    expect(system.trace.requests).toEqual([]);
  });

  it("drops the row rather than throwing when the install-source probe rejects", async () => {
    await system.load(xcodesMachine("2.0.3"));
    system.inject({ on: "spawn", argv: ["which", "xcodes"], mode: "rejects" });
    await expect(new XcodesProvider().listOutdated()).resolves.toEqual([]);
  });
});

describe("XcodesProvider.update", () => {
  it("fails soft when the delegation itself throws", async () => {
    await system.load(xcodesMachine("2.0.3"));
    // The owner lookup is the delegation's first step: a refused `which` aborts it.
    system.inject({ on: "spawn", argv: ["which", "xcodes"], mode: "rejects" });
    await expect(new XcodesProvider().update("xcodes")).resolves.toEqual({
      id: "xcodes",
      success: false,
      message: "xcodes est introuvable ou la mise à jour n'a pas pu être lancée.",
    });
  });
});

describe("XcodesProvider.installHint", () => {
  it("names the tap formula on macOS and refuses to invent one elsewhere", async () => {
    await system.load({ platform: "darwin" });
    expect(new XcodesProvider().installHint).toBe("brew install xcodesorg/made/xcodes");
    for (const platform of ["win32", "linux"] as const) {
      await system.load({ platform });
      const hint = new XcodesProvider().installHint;
      expect(hint).toContain("macOS uniquement");
      expect(hint).not.toContain("brew install");
    }
  });
});
