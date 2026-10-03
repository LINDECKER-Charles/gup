import { describe, expect, it } from "vitest";
import { detectInstallSource, runPmUpdate } from "../../../src/core/install-source.js";
import {
  binaryPathVia,
  type DelegatedIds,
  delegationRoutes,
  type Installer,
  installedVia,
  upgradeArgv,
} from "../contract/installers.js";
import { system } from "../system/fake-system.js";

/**
 * The installer machines and upgrade argvs the delegating cases rely on must
 * be the ones gup's real install-source recognises and runs: a machine meant
 * for winget that gup read as manual would let every winget route pass on
 * the wrong branch.
 */

const INSTALLERS: readonly Installer[] = ["scoop", "winget", "choco", "brew", "apt", "dnf"];

const IDS: DelegatedIds = {
  scoop: "tool",
  choco: "tool",
  winget: "Vendor.Tool",
  brew: "tool",
  apt: "tool",
  dnf: "tool",
};

describe("installer machines", () => {
  it.each(INSTALLERS)("are classified as %s by gup", async (installer) => {
    await system.load(installedVia(installer, "tool"));

    await expect(detectInstallSource("tool")).resolves.toBe(installer);
  });

  it("put a hand-installed binary where gup finds no installer", async () => {
    await system.load(installedVia("manual", "tool"));

    await expect(detectInstallSource("tool")).resolves.toBe("manual");
  });

  it.each(INSTALLERS)("expect the upgrade gup runs through %s", async (installer) => {
    await system.load(installedVia(installer, "tool"));

    await runPmUpdate("tool", installer, IDS, "à la main");

    const installs = system.trace.spawns.filter((spawn) => spawn.mode === "inherit");
    expect(installs.map((spawn) => spawn.argv)).toEqual([upgradeArgv(installer, IDS)]);
  });

  it("prefer the cask token over the formula, as gup does", () => {
    expect(upgradeArgv("brew", { brew: "tool", brewCask: "tool-app" })).toEqual([
      "brew",
      "upgrade",
      "--cask",
      "tool-app",
    ]);
  });

  it("merge the case's own machine over the installer's", () => {
    const spec = installedVia("apt", "tool", {
      bin: { other: "/usr/bin/other" },
      commands: [{ argv: ["tool", "--version"], stdout: "1.0" }],
      env: { LANG: "C" },
    });

    expect(spec).toEqual({
      platform: "linux",
      env: { LANG: "C" },
      bin: { dpkg: "/usr/bin/dpkg", tool: "/usr/bin/tool", other: "/usr/bin/other" },
      commands: [
        { argv: ["dpkg", "-S", "/usr/bin/tool"], stdout: "tool: /usr/bin/tool" },
        { argv: ["tool", "--version"], stdout: "1.0" },
      ],
    });
    expect(binaryPathVia("apt", "tool")).toBe("/usr/bin/tool");
  });
});

describe("delegation routes", () => {
  it("route every installer, distro ones only when the provider maps them", () => {
    const delegation = { ids: { scoop: "tool", brew: "tool" }, manualMessage: "à la main" };

    const routes = delegationRoutes("tool", delegation);

    expect(routes.map((route) => [route.via, route.installs])).toEqual([
      ["scoop", [["scoop", "update", "tool"]]],
      ["winget", []],
      ["choco", []],
      ["brew", [["brew", "upgrade", "--formula", "tool"]]],
      ["manual", []],
    ]);
    const skipped = { success: false, skipped: true, message: "à la main" };
    expect(routes.find((route) => route.via === "winget")?.outcome).toEqual(skipped);
    expect(routes.find((route) => route.via === "scoop")).not.toHaveProperty("outcome");
    const withDistros = delegationRoutes("tool", { ...delegation, ids: IDS });
    expect(withDistros.map((route) => route.via)).toContain("dnf");
  });

  it("put the provider's extra machine state on every route", () => {
    const index = { url: "https://example.test/index.json", json: {} };
    const routes = delegationRoutes(
      "tool",
      { ids: { scoop: "tool" }, manualMessage: "à la main" },
      { http: [index] },
    );

    for (const route of routes) expect(route.system.http).toEqual([index]);
  });
});
