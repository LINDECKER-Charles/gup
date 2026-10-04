import { describe, expect, it } from "vitest";
import {
  DotnetSdkProvider,
  isUpgrade,
  parseDotnetSdks,
  pickHighestSdk,
  sdkChannel,
} from "../../../src/providers/dotnet-php/dotnet-sdk.js";
import { type Installer, installedVia, upgradeArgv } from "../../support/contract/installers.js";
import { system } from "../../support/system/fake-system.js";
import type { CommandScript, HttpRoute, SystemSpec } from "../../support/system/types.js";
import { installArgvs, probeArgvs } from "../../support/system/trace.js";
import {
  DOTNET_APT_MACHINE,
  DOTNET_DOWNLOAD_PAGE,
  dotnetManualMessage,
  LIST_SDKS_STDOUT,
  RELEASES_INDEX,
  RELEASES_INDEX_URL,
  RELEASES_ROUTE,
} from "./dotnet-php.cases.js";
import { useLocale } from "../../support/locale.js";

/**
 * The .NET SDK: one row for the installed channel only (a new major is a
 * migration, not an update), and an upgrade handed over with channel-scoped
 * package ids — never one that could drag the machine onto another major.
 */

const LIST_SDKS = ["dotnet", "--list-sdks"];

/** `dotnet --list-sdks` printing `sdks` on macOS, the release index answering `index`. */
function sdkMachine(sdks: string, index: unknown = RELEASES_INDEX): SystemSpec {
  return {
    platform: "darwin",
    bin: { dotnet: "/usr/local/share/dotnet/dotnet" },
    commands: [{ argv: LIST_SDKS, stdout: sdks }],
    http: [{ url: RELEASES_INDEX_URL, json: index }],
  };
}

/** The index of one channel. */
function indexOf(entry: Record<string, unknown>): unknown {
  return { "releases-index": [entry] };
}

/** An SDK `installer` owns, with the nominal release index unless `extra` says otherwise. */
function ownedBy(installer: Installer, extra: Omit<SystemSpec, "platform"> = {}): SystemSpec {
  return installedVia(installer, "dotnet", { http: [RELEASES_ROUTE], ...extra });
}

function brewListArgv(formula: string): string[] {
  return ["brew", "list", "--versions", formula];
}

/** A Homebrew SDK whose `brew list --versions <keg>` answers `answer`. */
function brewOwned(keg: string, answer: Omit<CommandScript, "argv">): SystemSpec {
  return ownedBy("brew", {
    bin: { brew: "/opt/homebrew/bin/brew" },
    commands: [{ argv: brewListArgv(keg), ...answer }],
  });
}

describe("parseDotnetSdks", () => {
  it("keeps the version and drops the install root", () => {
    expect(parseDotnetSdks(LIST_SDKS_STDOUT)).toEqual(["8.0.404", "9.0.101"]);
    expect(parseDotnetSdks("10.0.100 [/usr/local/share/dotnet/sdk]")).toEqual(["10.0.100"]);
  });

  it("keeps a preview band intact", () => {
    expect(parseDotnetSdks("10.0.100-preview.6.25358.103 [/usr/share/dotnet/sdk]")).toEqual([
      "10.0.100-preview.6.25358.103",
    ]);
  });

  it("drops host warnings and banners by anchoring on the bracket", () => {
    const stdout = [
      // The first-run banner any dotnet command prints once, versions included.
      "Welcome to .NET 8.0!",
      "---------------------",
      "SDK Version: 8.0.404",
      "Impossible de trouver le SDK…",
      "DOTNET_ROOT=/usr/share/dotnet",
      "8.0.404 [/usr/share/dotnet/sdk]",
    ].join("\n");
    expect(parseDotnetSdks(stdout)).toEqual(["8.0.404"]);
  });

  it("returns [] on blank and garbage input", () => {
    expect(parseDotnetSdks("")).toEqual([]);
    expect(parseDotnetSdks("\r\n   \r\n")).toEqual([]);
    expect(parseDotnetSdks("no sdks were found")).toEqual([]);
  });
});

describe("pickHighestSdk", () => {
  it("returns null when nothing was parsed", () => {
    expect(pickHighestSdk([])).toBeNull();
  });

  it("picks the highest side-by-side SDK, numerically", () => {
    expect(pickHighestSdk(["8.0.404", "10.0.100", "9.0.101"])).toBe("10.0.100");
    // 8.0.100 must not lose to 8.0.99 as a string comparison would have it.
    expect(pickHighestSdk(["8.0.99", "8.0.100"])).toBe("8.0.100");
  });

  it("ranks a release above every preview of the same core, in either order", () => {
    const preview6 = "10.0.100-preview.6.25358.103";
    expect(pickHighestSdk([preview6, "10.0.100"])).toBe("10.0.100");
    expect(pickHighestSdk(["10.0.100", preview6])).toBe("10.0.100");
    expect(pickHighestSdk(["10.0.100-preview.5.25277.114", preview6])).toBe(preview6);
  });

  it("treats a missing segment as zero, in either order", () => {
    expect(pickHighestSdk(["8.0.404", "8.0.404.1"])).toBe("8.0.404.1");
    expect(pickHighestSdk(["8.0.404.1", "8.0.404"])).toBe("8.0.404.1");
  });
});

describe("sdkChannel", () => {
  it("keeps major.minor of a full SDK version", () => {
    expect(sdkChannel("8.0.404")).toBe("8.0");
    expect(sdkChannel("10.0.100-preview.6.25358.103")).toBe("10.0");
  });

  it("returns null for anything that is not major.minor.band", () => {
    for (const version of ["8", "8.0", "abc", ""]) expect(sdkChannel(version)).toBeNull();
  });
});

describe("isUpgrade", () => {
  it("offers a newer band inside the channel", () => {
    expect(isUpgrade("8.0.404", "8.0.414")).toBe(true);
    // 8.0.404 must not read as newer than 8.0.4004.
    expect(isUpgrade("8.0.404", "8.0.4004")).toBe(true);
  });

  it("offers nothing when equal or already ahead", () => {
    expect(isUpgrade("8.0.414", "8.0.414")).toBe(false);
    expect(isUpgrade("8.0.414", "8.0.404")).toBe(false);
  });

  it("never pushes a stable install onto a preview", () => {
    expect(isUpgrade("10.0.100", "10.0.200-preview.1.25000.1")).toBe(false);
  });

  it("keeps a preview user moving — including onto the GA that supersedes it", () => {
    expect(isUpgrade("10.0.100-preview.5.25277.114", "10.0.100-preview.6.25358.103")).toBe(true);
    expect(isUpgrade("10.0.100-preview.6.25358.103", "10.0.100")).toBe(true);
  });
});

describe("DotnetSdkProvider in English", () => {
  useLocale("en");

  it("labels the channel's support phase in English", async () => {
    await system.load(sdkMachine("8.0.404 [/usr/share/dotnet/sdk]"));
    await expect(new DotnetSdkProvider().listOutdated()).resolves.toMatchObject([
      { id: "8.0", note: "LTS · active support" },
    ]);
  });

  it("still ignores a support phase named like an object property", async () => {
    const index = indexOf({
      "channel-version": "8.0",
      "latest-sdk": "8.0.414",
      "support-phase": "toString",
    });
    await system.load(sdkMachine("8.0.404 [/usr/share/dotnet/sdk]", index));
    const [row] = await new DotnetSdkProvider().listOutdated();
    expect(row).toBeDefined();
    expect(row?.note).toBeUndefined();
  });
});

describe("DotnetSdkProvider.listOutdated: the installed channel only", () => {
  it("emits no row at all when a newer major exists but the channel is current", async () => {
    await system.load(sdkMachine("10.0.100 [/usr/share/dotnet/sdk]"));
    await expect(new DotnetSdkProvider().listOutdated()).resolves.toEqual([]);
  });

  it("labels an LTS channel in active support", async () => {
    await system.load(sdkMachine("8.0.404 [/usr/share/dotnet/sdk]"));
    await expect(new DotnetSdkProvider().listOutdated()).resolves.toEqual([
      { id: "8.0", name: ".NET SDK 8.0", current: "8.0.404", latest: "8.0.414", note: "LTS · support actif" },
    ]);
  });

  it("omits the note entirely when the index carries no label we know", async () => {
    const index = indexOf({ "channel-version": "8.0", "latest-sdk": "8.0.414" });
    await system.load(sdkMachine("8.0.404 [/usr/share/dotnet/sdk]", index));
    await expect(new DotnetSdkProvider().listOutdated()).resolves.toEqual([
      { id: "8.0", name: ".NET SDK 8.0", current: "8.0.404", latest: "8.0.414" },
    ]);
  });

  it("returns [] when the runner refuses dotnet", async () => {
    await system.load(sdkMachine("8.0.404 [/usr/share/dotnet/sdk]"));
    system.inject({ on: "spawn", argv: LIST_SDKS, mode: "rejects" });
    await expect(new DotnetSdkProvider().listOutdated()).resolves.toEqual([]);
    expect(system.trace.requests).toEqual([]);
  });

  it("returns [] when the installed version has no channel, without hitting the network", async () => {
    await system.load(sdkMachine("8 [/usr/share/dotnet/sdk]"));
    await expect(new DotnetSdkProvider().listOutdated()).resolves.toEqual([]);
    expect(system.trace.requests).toEqual([]);
  });

  it("returns [] on a malformed payload rather than throwing", async () => {
    for (const payload of [null, "<html>captive portal</html>", { "releases-index": "nope" }, {}]) {
      await system.load(sdkMachine("8.0.404 [/usr/share/dotnet/sdk]", payload));
      await expect(new DotnetSdkProvider().listOutdated()).resolves.toEqual([]);
    }
  });

  it("returns [] when the installed channel is absent from the index", async () => {
    await system.load(sdkMachine("7.0.404 [/usr/share/dotnet/sdk]"));
    await expect(new DotnetSdkProvider().listOutdated()).resolves.toEqual([]);
  });

  it("returns [] when latest-sdk is missing or malformed", async () => {
    for (const latest of [undefined, 8, "unknown"]) {
      const index = indexOf({ "channel-version": "8.0", "latest-sdk": latest });
      await system.load(sdkMachine("8.0.404 [/usr/share/dotnet/sdk]", index));
      await expect(new DotnetSdkProvider().listOutdated()).resolves.toEqual([]);
    }
  });

  it("never pushes a stable install onto the channel's preview band", async () => {
    const index = indexOf({
      "channel-version": "10.0",
      "latest-sdk": "10.0.200-preview.1.25000.1",
      "support-phase": "active",
      "release-type": "sts",
    });
    await system.load(sdkMachine("10.0.100 [/usr/share/dotnet/sdk]", index));
    await expect(new DotnetSdkProvider().listOutdated()).resolves.toEqual([]);
  });
});

describe("DotnetSdkProvider.listOutdated: the single sudo batch", () => {
  it("leaves the row unflagged when gup already runs as root", async () => {
    await system.load({ ...DOTNET_APT_MACHINE, elevated: true });
    const [row] = await new DotnetSdkProvider().listOutdated();
    expect(row).toBeDefined();
    expect(row?.requiresAdmin).toBeUndefined();
  });

  it("leaves an SDK no distro package owns unflagged", async () => {
    await system.load({
      ...DOTNET_APT_MACHINE,
      bin: { dotnet: "/home/u/.dotnet/dotnet" },
      commands: [{ argv: LIST_SDKS, stdout: "8.0.404 [/home/u/.dotnet/sdk]" }],
    });
    const [row] = await new DotnetSdkProvider().listOutdated();
    expect(row).toBeDefined();
    expect(row?.requiresAdmin).toBeUndefined();
  });

  it("never probes the install source outside Linux", async () => {
    await system.load(sdkMachine("8.0.404 [/usr/share/dotnet/sdk]"));
    await new DotnetSdkProvider().listOutdated();
    expect(probeArgvs()).toEqual([LIST_SDKS]);
  });
});

describe("DotnetSdkProvider.update: channel-scoped ids", () => {
  it("refuses an id that is not a channel", async () => {
    await system.load(ownedBy("winget"));
    await expect(new DotnetSdkProvider().update("Microsoft.DotNet.SDK.8")).resolves.toEqual({
      id: "Microsoft.DotNet.SDK.8",
      success: false,
      message: "Canal .NET non reconnu : Microsoft.DotNet.SDK.8",
    });
    expect(installArgvs()).toEqual([]);
  });

  it("upgrades the installed versioned brew keg, from a trimmed channel id", async () => {
    await system.load(brewOwned("dotnet@8", { stdout: "dotnet@8 8.0.14\n" }));
    await expect(new DotnetSdkProvider().update(" 8.0 ")).resolves.toEqual({
      id: "8.0",
      success: true,
    });
    expect(installArgvs()).toEqual([upgradeArgv("brew", { brew: "dotnet@8" })]);
  });

  it.each([
    ["the keg is absent", { exitCode: 1 }],
    ["brew prints nothing", { stdout: "   \n" }],
  ])("falls back to the unversioned formula when %s", async (_case, answer) => {
    await system.load(brewOwned("dotnet@10", answer));
    await new DotnetSdkProvider().update("10.0");
    expect(installArgvs()).toEqual([upgradeArgv("brew", { brew: "dotnet" })]);
  });

  it("falls back to the unversioned formula when the runner refuses brew", async () => {
    await system.load(brewOwned("dotnet@8", {}));
    system.inject({ on: "spawn", argv: brewListArgv("dotnet@8"), mode: "rejects" });
    await new DotnetSdkProvider().update("8.0");
    expect(installArgvs()).toEqual([upgradeArgv("brew", { brew: "dotnet" })]);
  });

  it("skips the brew probe entirely on Windows", async () => {
    await system.load(ownedBy("winget"));
    await new DotnetSdkProvider().update("8.0");
    expect(probeArgvs()).toEqual([["where", "dotnet"]]);
  });

  it("names the preview manifests and ships no choco, apt or dnf id", async () => {
    const preview: HttpRoute = {
      url: RELEASES_INDEX_URL,
      json: indexOf({
        "channel-version": "11.0",
        "latest-sdk": "11.0.100-preview.1.25000.1",
        "support-phase": "preview",
      }),
    };
    await system.load(ownedBy("winget", { http: [preview] }));
    await new DotnetSdkProvider().update("11.0");
    expect(installArgvs()).toEqual([
      upgradeArgv("winget", { winget: "Microsoft.DotNet.SDK.Preview" }),
    ]);
    for (const installer of ["choco", "apt", "dnf"] as const) {
      await system.load(ownedBy(installer, { http: [preview] }));
      await expect(new DotnetSdkProvider().update("11.0")).resolves.toMatchObject({
        skipped: true,
        message: dotnetManualMessage("11.0"),
      });
    }
  });

  it("uses the underscored winget id and the legacy choco id for 3.1", async () => {
    await system.load(ownedBy("winget"));
    await new DotnetSdkProvider().update("3.1");
    expect(installArgvs()).toEqual([upgradeArgv("winget", { winget: "Microsoft.DotNet.SDK.3_1" })]);
    await system.load(ownedBy("choco"));
    await new DotnetSdkProvider().update("3.1");
    expect(installArgvs()).toEqual([upgradeArgv("choco", { choco: "dotnetcore-sdk" })]);
  });

  it("ships no choco id for a channel chocolatey never published", async () => {
    await system.load(ownedBy("choco"));
    await expect(new DotnetSdkProvider().update("3.0")).resolves.toEqual({
      id: "3.0",
      success: false,
      skipped: true,
      message: dotnetManualMessage("3.0"),
    });
  });

  it("falls back to the stable naming when the index lookup fails", async () => {
    await system.load(ownedBy("winget"));
    system.inject({ on: "http", url: RELEASES_INDEX_URL, mode: "network" });
    await new DotnetSdkProvider().update("8.0");
    expect(installArgvs()).toEqual([upgradeArgv("winget", { winget: "Microsoft.DotNet.SDK.8" })]);
  });

  it("degrades an upgrade the runner refuses to the same SKIP as the manual path", async () => {
    await system.load(ownedBy("winget"));
    system.answerInstall({ rejects: true });
    const outcome = await new DotnetSdkProvider().update("8.0");
    expect(outcome).toMatchObject({ id: "8.0", success: false, skipped: true });
    expect(outcome.message).toContain(DOTNET_DOWNLOAD_PAGE);
  });

  it("keeps an unknown channel's refusal in a batch", async () => {
    await system.load(ownedBy("winget"));
    const outcomes = await new DotnetSdkProvider().updateAll([
      { id: "8.0", current: "8.0.404", latest: "8.0.414" },
      { id: "bogus", current: "1", latest: "2" },
    ]);
    expect(outcomes).toEqual([
      { id: "8.0", success: true },
      { id: "bogus", success: false, message: "Canal .NET non reconnu : bogus" },
    ]);
  });
});
