import { describe, expect, it } from "vitest";
import * as runner from "../../../src/core/runner.js";
import {
  isUpgrade,
  parseSwiftlyVersion,
  SwiftlyProvider,
} from "../../../src/providers/toolchain/swiftly.js";
import { replaceForTest } from "../../support/system/boundary-spy.js";
import { system } from "../../support/system/fake-system.js";
import { installArgvs, probeArgvs } from "../../support/system/trace.js";
import {
  SWIFTLY_BREW_MACHINE,
  SWIFTLY_SELF_UPDATE,
  SWIFTLY_VERSION_ARGV,
  swiftlyMachine,
} from "./toolchain.cases.js";

/**
 * swiftly, the Swift toolchain manager: the binary only, never the
 * toolchains. Who owns the binary decides the update, since `swiftly
 * self-update` refuses an install it did not make.
 */

const UNREACHABLE = "swiftly est introuvable ou n'a pas pu être lancé.";

describe("SwiftlyProvider.isAvailable", () => {
  it("refuses Windows without probing — upstream ships no Windows build", async () => {
    await system.load({ platform: "win32", bin: { swiftly: "C:\\Tools\\swiftly.exe" } });
    const probe = replaceForTest(runner, "commandExists", () => Promise.resolve(true));
    await expect(new SwiftlyProvider().isAvailable()).resolves.toBe(false);
    expect(probe).not.toHaveBeenCalled();
  });

  it("probes `swiftly` on Linux too", async () => {
    const swiftly = "/home/u/.local/share/swiftly/bin/swiftly";
    await system.load({ platform: "linux", bin: { swiftly } });
    await expect(new SwiftlyProvider().isAvailable()).resolves.toBe(true);
  });

  it("is unavailable rather than throwing when the probe blows up", async () => {
    await system.load(swiftlyMachine("1.1.3"));
    replaceForTest(runner, "commandExists", () => Promise.reject(new Error("nope")));
    await expect(new SwiftlyProvider().isAvailable()).resolves.toBe(false);
  });
});

describe("parseSwiftlyVersion", () => {
  it("reads the bare version swift-argument-parser prints", () => {
    expect(parseSwiftlyVersion("1.1.3")).toBe("1.1.3");
    expect(parseSwiftlyVersion("1.1.3\n")).toBe("1.1.3");
  });

  it("keeps the development-branch suffix intact", () => {
    expect(parseSwiftlyVersion("1.3.0-dev")).toBe("1.3.0-dev");
  });

  it("tolerates a decorated line", () => {
    expect(parseSwiftlyVersion("swiftly 1.1.3")).toBe("1.1.3");
    expect(parseSwiftlyVersion("v1.1.3")).toBe("1.1.3");
    expect(parseSwiftlyVersion("1.1")).toBe("1.1");
  });

  it("skips a warning printed above the version", () => {
    expect(parseSwiftlyVersion("warning: no toolchain in use\n1.1.3")).toBe("1.1.3");
  });

  it("returns null on blank, garbage and a line carrying extra text", () => {
    expect(parseSwiftlyVersion("")).toBeNull();
    expect(parseSwiftlyVersion("\n \n")).toBeNull();
    expect(parseSwiftlyVersion("USAGE: swiftly <subcommand>")).toBeNull();
    expect(parseSwiftlyVersion("swiftly version 1.1.3")).toBeNull();
  });
});

describe("swiftly isUpgrade", () => {
  it("only fires when the published core is strictly newer", () => {
    expect(isUpgrade("1.1.3", "1.2.0")).toBe(true);
    expect(isUpgrade("1.1.3", "1.1.3")).toBe(false);
    expect(isUpgrade("1.2.0", "1.1.3")).toBe(false);
  });

  it("sorts 1.10 above 1.9 instead of comparing as strings", () => {
    expect(isUpgrade("1.9.0", "1.10.0")).toBe(true);
    expect(isUpgrade("1.10.0", "1.9.0")).toBe(false);
  });

  it("never proposes a downgrade from a development build", () => {
    expect(isUpgrade("1.3.0-dev", "1.1.3")).toBe(false);
    expect(isUpgrade("1.1.3-dev", "1.1.3")).toBe(true);
    expect(isUpgrade("1.1.3", "1.1.3-dev")).toBe(false);
  });

  it("compares missing trailing segments as zero and survives garbage", () => {
    expect(isUpgrade("1.1", "1.1.1")).toBe(true);
    expect(isUpgrade("1.1.0", "1.1")).toBe(false);
    expect(isUpgrade("main", "1.0.0")).toBe(true);
  });

  it("stays quiet between two pre-releases of the same core", () => {
    expect(isUpgrade("1.3.0-dev", "1.3.0-dev")).toBe(false);
    expect(isUpgrade("1.2.0-dev", "1.3.0-dev")).toBe(true);
  });
});

describe("SwiftlyProvider.listOutdated", () => {
  it("costs no GitHub round-trip and no owner probe when the version is unreadable", async () => {
    await system.load(swiftlyMachine("USAGE: swiftly <subcommand>"));
    await expect(new SwiftlyProvider().listOutdated()).resolves.toEqual([]);
    expect(system.trace.requests).toEqual([]);
    expect(probeArgvs()).toEqual([SWIFTLY_VERSION_ARGV]);
  });

  it("probes no install source when nothing is behind", async () => {
    await system.load(swiftlyMachine("1.2.0"));
    await expect(new SwiftlyProvider().listOutdated()).resolves.toEqual([]);
    expect(probeArgvs()).toEqual([SWIFTLY_VERSION_ARGV]);
  });

  it("returns [] rather than throwing when the spawn is rejected", async () => {
    await system.load(swiftlyMachine("1.1.3"));
    system.inject({ on: "spawn", argv: SWIFTLY_VERSION_ARGV, mode: "rejects" });
    await expect(new SwiftlyProvider().listOutdated()).resolves.toEqual([]);
    expect(system.trace.requests).toEqual([]);
  });

  it("drops the row rather than throwing when the install-source probe rejects", async () => {
    await system.load(swiftlyMachine("1.1.3"));
    system.inject({ on: "spawn", argv: ["which", "swiftly"], mode: "rejects" });
    await expect(new SwiftlyProvider().listOutdated()).resolves.toEqual([]);
  });
});

describe("SwiftlyProvider.update", () => {
  it("fails soft, running nothing, when the source detection throws", async () => {
    await system.load(swiftlyMachine("1.1.3"));
    system.inject({ on: "spawn", argv: ["which", "swiftly"], mode: "rejects" });
    await expect(new SwiftlyProvider().update("swiftly")).resolves.toEqual({
      id: "swiftly",
      success: false,
      message: UNREACHABLE,
    });
    expect(installArgvs()).toEqual([]);
  });

  it("fails soft when the self-update spawn is rejected outright", async () => {
    await system.load(swiftlyMachine("1.1.3"));
    system.inject({ on: "spawn", argv: SWIFTLY_SELF_UPDATE, mode: "rejects" });
    await expect(new SwiftlyProvider().update("swiftly")).resolves.toEqual({
      id: "swiftly",
      success: false,
      message: UNREACHABLE,
    });
  });

  it("fails soft when the package-manager delegation rejects", async () => {
    await system.load(SWIFTLY_BREW_MACHINE);
    const upgrade = ["brew", "upgrade", "--formula", "swiftly"];
    system.inject({ on: "spawn", argv: upgrade, mode: "rejects" });
    await expect(new SwiftlyProvider().update("swiftly")).resolves.toMatchObject({
      id: "swiftly",
      success: false,
    });
    expect(installArgvs()).toEqual([upgrade]);
  });
});

describe("SwiftlyProvider.installHint", () => {
  it("points at swift.org per platform and never suggests Windows", async () => {
    await system.load({ platform: "darwin" });
    expect(new SwiftlyProvider().installHint).toContain("install/macos/swiftly");
    await system.load({ platform: "linux" });
    expect(new SwiftlyProvider().installHint).toContain("install/linux/swiftly");
    await system.load({ platform: "win32" });
    const hint = new SwiftlyProvider().installHint;
    expect(hint).toContain("ne cible pas Windows");
    expect(hint).not.toContain("brew install");
  });
});
