import * as fs from "node:fs";
import * as os from "node:os";
import { describe, expect, it } from "vitest";
import * as runner from "../../../src/core/runner.js";
import {
  compareNumericVersions,
  highestStableTag,
  NixProvider,
  parseDeterminateVersion,
  parseNixVersion,
} from "../../../src/providers/os/nix.js";
import { replaceForTest } from "../../support/system/boundary-spy.js";
import { system } from "../../support/system/fake-system.js";
import type { SystemSpec } from "../../support/system/types.js";
import { installArgvs } from "../../support/system/trace.js";
import {
  NIX_BIN,
  NIX_DETERMINATE_VERSION,
  NIX_MACHINE,
  NIX_PROFILE_ROW,
  NIX_PROFILE_UPGRADE_ARGV,
  NIX_TAGS_BODY,
  NIX_TAGS_URL,
  NIX_UPSTREAM_VERSION,
} from "./posix.cases.js";

/**
 * Nix as the native package manager of macOS and Linux: the `nix` binary
 * against the track it follows (upstream tags, Determinate releases, or the
 * NixOS system closure), and the user's profile as one refresh row.
 */

/** The nix-env a NixOS system closure puts on PATH. */
const NIXOS_NIX_ENV = "/run/current-system/sw/bin/nix-env";

/** The standalone machine with `overrides` merged in. */
function nixMachine(overrides: Partial<SystemSpec>): SystemSpec {
  return { ...NIX_MACHINE, ...overrides };
}

/** No profile, and `nix --version` printing `banner`. */
function bannerMachine(banner: string, http: SystemSpec["http"] = []): SystemSpec {
  return nixMachine({
    commands: [{ argv: ["nix", "--version"], stdout: banner }],
    http,
    fs: {},
  });
}

/** `nix --version` fails, so only the profile probes decide what is listed. */
function profileOnlyMachine(overrides: Partial<SystemSpec> = {}): SystemSpec {
  return nixMachine({
    commands: [{ argv: ["nix", "--version"], exitCode: 1 }],
    http: [],
    fs: {},
    ...overrides,
  });
}

describe("NixProvider.isAvailable", () => {
  it("never probes the binary on Windows — WSL Nix belongs to wsl-nix", async () => {
    await system.load({ platform: "win32", bin: { nix: "C:\\tools\\nix.exe" } });
    await expect(new NixProvider().isAvailable()).resolves.toBe(false);
  });

  it("degrades to false when the probe itself throws", async () => {
    await system.load(NIX_MACHINE);
    replaceForTest(runner, "commandExists", () => Promise.reject(new Error("spawn")));
    await expect(new NixProvider().isAvailable()).resolves.toBe(false);
  });
});

describe("NixProvider.listOutdated: the binary", () => {
  it("names nixos-rebuild when Nix comes from the NixOS system closure", async () => {
    await system.load(
      nixMachine({ bin: { nix: NIX_BIN, "nix-env": NIXOS_NIX_ENV }, fs: {} }),
    );
    const [row] = await new NixProvider().listOutdated();
    expect(row?.note).toBe("profil système NixOS — mise à jour par nixos-rebuild");
  });

  it("emits nothing when a Determinate banner drops its product version", async () => {
    await system.load(bannerMachine("nix (Determinate Nix) 2.35.1"));
    await expect(new NixProvider().listOutdated()).resolves.toEqual([]);
    expect(system.trace.requests).toEqual([]);
  });

  it("emits nothing when the install is already on the newest tag", async () => {
    await system.load(bannerMachine("nix (Nix) 2.30.0", [{ url: NIX_TAGS_URL, json: NIX_TAGS_BODY }]));
    await expect(new NixProvider().listOutdated()).resolves.toEqual([]);
  });

  it("survives a rate-limit body arriving, with a 200, where a tag list is expected", async () => {
    const rateLimited = {
      message: "API rate limit exceeded for 203.0.113.7.",
      documentation_url: "https://docs.github.com/rest/overview/rate-limits",
    };
    await system.load(bannerMachine(NIX_UPSTREAM_VERSION, [{ url: NIX_TAGS_URL, json: rateLimited }]));
    await expect(new NixProvider().listOutdated()).resolves.toEqual([]);
  });

  it("survives a tag list whose entries are not objects", async () => {
    const odd = [null, 42, { name: 7 }, "2.99.0"];
    await system.load(bannerMachine(NIX_UPSTREAM_VERSION, [{ url: NIX_TAGS_URL, json: odd }]));
    await expect(new NixProvider().listOutdated()).resolves.toEqual([]);
  });

  it("returns [] rather than throwing when the runner refuses nix", async () => {
    await system.load(bannerMachine(NIX_UPSTREAM_VERSION));
    system.inject({ on: "spawn", argv: ["nix", "--version"], mode: "rejects" });
    await expect(new NixProvider().listOutdated()).resolves.toEqual([]);
  });
});

describe("NixProvider.listOutdated: the profile row", () => {
  it("honours XDG_STATE_HOME for the profile probe", async () => {
    await system.load(
      profileOnlyMachine({
        env: { XDG_STATE_HOME: "/Users/u/.xdgstate" },
        fs: { "/Users/u/.xdgstate/nix/profile": { kind: "dir" } },
      }),
    );
    await expect(new NixProvider().listOutdated()).resolves.toEqual([NIX_PROFILE_ROW]);
  });

  it("falls back to $XDG_STATE_HOME's default when the variable is empty", async () => {
    await system.load(
      profileOnlyMachine({
        env: { XDG_STATE_HOME: "" },
        fs: { "/Users/u/.local/state/nix/profile": { kind: "dir" } },
      }),
    );
    await expect(new NixProvider().listOutdated()).resolves.toEqual([NIX_PROFILE_ROW]);
  });

  it("counts a NIX_PROFILES entry under $HOME, never the system profile", async () => {
    await system.load(profileOnlyMachine({ env: { NIX_PROFILES: "/nix/var/nix/profiles/default" } }));
    await expect(new NixProvider().listOutdated()).resolves.toEqual([]);

    const both = "/nix/var/nix/profiles/default /Users/u/.nix-profile";
    await system.load(profileOnlyMachine({ env: { NIX_PROFILES: both } }));
    await expect(new NixProvider().listOutdated()).resolves.toEqual([NIX_PROFILE_ROW]);
  });

  it("accepts a home directory already carrying a trailing slash", async () => {
    await system.load(
      profileOnlyMachine({ env: { HOME: "/Users/u/", NIX_PROFILES: "/Users/u/.nix-profile" } }),
    );
    await expect(new NixProvider().listOutdated()).resolves.toEqual([NIX_PROFILE_ROW]);
  });

  it("emits no profile row when homedir is unresolvable", async () => {
    await system.load(
      profileOnlyMachine({
        env: { NIX_PROFILES: "/Users/u/.nix-profile" },
        fs: { "/Users/u/.nix-profile": { kind: "dir" } },
      }),
    );
    replaceForTest(os, "homedir", () => {
      throw new Error("no passwd entry");
    });
    await expect(new NixProvider().listOutdated()).resolves.toEqual([]);
  });

  it("emits no profile row when homedir is empty", async () => {
    await system.load(profileOnlyMachine({ fs: { "/Users/u/.nix-profile": { kind: "dir" } } }));
    replaceForTest(os, "homedir", () => "");
    await expect(new NixProvider().listOutdated()).resolves.toEqual([]);
  });

  it("treats an existsSync throw as 'no profile there'", async () => {
    await system.load(profileOnlyMachine({ fs: { "/Users/u/.nix-profile": { kind: "dir" } } }));
    replaceForTest(fs, "existsSync", () => {
      throw new Error("EPERM");
    });
    await expect(new NixProvider().listOutdated()).resolves.toEqual([]);
  });
});

describe("NixProvider.update: the profile", () => {
  it("upgrades the profile through the new CLI, feature flags included", async () => {
    await system.load(NIX_MACHINE);
    await expect(new NixProvider().update("profile")).resolves.toEqual({
      id: "profile",
      success: true,
    });
    expect(installArgvs()).toEqual([NIX_PROFILE_UPGRADE_ARGV]);
  });

  it.each([
    ["a Ctrl+C skip", { aborted: true }],
    ["a timeout", { timedOut: true }],
  ])("does not retry with nix-env after %s", async (_cause, answer) => {
    await system.load(NIX_MACHINE);
    system.answerInstall(answer);
    await expect(new NixProvider().update("profile")).resolves.toEqual({
      id: "profile",
      success: false,
    });
    expect(installArgvs()).toEqual([NIX_PROFILE_UPGRADE_ARGV]);
  });

  it("refuses the nix-env fallback on a profile managed by `nix profile`", async () => {
    await system.load(
      nixMachine({ fs: { "/Users/u/.nix-profile/manifest.json": { kind: "file", content: "{}" } } }),
    );
    system.answerInstall({ exitCode: 1 });
    const outcome = await new NixProvider().update("profile");
    expect(outcome).toMatchObject({ id: "profile", success: false });
    expect(outcome.message).toMatch(/Pas de repli sur nix-env/);
    expect(installArgvs()).toHaveLength(1);
  });

  it("reports both failures when nix-env is missing", async () => {
    await system.load(nixMachine({ bin: { nix: NIX_BIN } }));
    system.answerInstall({ exitCode: 1 });
    await expect(new NixProvider().update("profile")).resolves.toEqual({
      id: "profile",
      success: false,
      message: "nix profile upgrade --all a échoué et nix-env est introuvable.",
    });
  });

  it("falls back to `nix-env -u '*'` on a classic profile", async () => {
    await system.load(NIX_MACHINE);
    system.answerInstall({ exitCode: 1 }, { exitCode: 0 });
    await expect(new NixProvider().update("profile")).resolves.toEqual({
      id: "profile",
      success: true,
    });
    expect(installArgvs()).toEqual([NIX_PROFILE_UPGRADE_ARGV, ["nix-env", "-u", "*"]]);
  });

  it("reports the double failure when nix-env fails too", async () => {
    await system.load(NIX_MACHINE);
    system.answerInstall({ exitCode: 1 }, { exitCode: 1 });
    await expect(new NixProvider().update("profile")).resolves.toEqual({
      id: "profile",
      success: false,
      message: "nix profile upgrade --all puis nix-env -u '*' ont échoué.",
    });
  });
});

describe("NixProvider.update: the binary and unknown targets", () => {
  it("still tries upgrade-nix when the version probe itself failed", async () => {
    await system.load(profileOnlyMachine());
    await expect(new NixProvider().update("nix")).resolves.toEqual({ id: "nix", success: true });
    expect(installArgvs()).toEqual([["nix", "upgrade-nix"]]);
  });

  it("skips the binary upgrade on a NixOS system closure", async () => {
    await system.load(nixMachine({ bin: { nix: NIX_BIN, "nix-env": NIXOS_NIX_ENV } }));
    const outcome = await new NixProvider().update("nix");
    expect(outcome).toMatchObject({ id: "nix", success: false, skipped: true });
    expect(outcome.message).toMatch(/nixos-rebuild switch/);
    expect(installArgvs()).toEqual([]);
  });

  it("rejects an unknown target by name", async () => {
    await system.load(NIX_MACHINE);
    await expect(new NixProvider().update("hello")).resolves.toEqual({
      id: "hello",
      success: false,
      message: "Cible inconnue pour nix : hello",
    });
    expect(installArgvs()).toEqual([]);
  });

  it("turns a spawn the runner refuses into a failed outcome", async () => {
    await system.load(NIX_MACHINE);
    system.answerInstall({ rejects: true });
    await expect(new NixProvider().update("profile")).resolves.toEqual({
      id: "profile",
      success: false,
      message: "La commande nix n'a pas pu être lancée.",
    });
  });

  it("runs the two targets one after the other, in row order", async () => {
    await system.load(NIX_MACHINE);
    await new NixProvider().updateAll([
      { id: "nix", current: "1", latest: "2" },
      NIX_PROFILE_ROW,
    ]);
    expect(installArgvs()).toEqual([["nix", "upgrade-nix"], NIX_PROFILE_UPGRADE_ARGV]);
  });
});

describe("nix parsers", () => {
  it("parseNixVersion takes the last version-shaped token of the first line", () => {
    expect(parseNixVersion(NIX_UPSTREAM_VERSION)).toBe("2.28.3");
    expect(parseNixVersion(NIX_DETERMINATE_VERSION)).toBe("2.35.1");
    expect(parseNixVersion("nix (Nix) 2.18\nextra 9.9.9")).toBe("2.18");
  });

  it("parseNixVersion is null on blank and garbage input", () => {
    expect(parseNixVersion("")).toBeNull();
    expect(parseNixVersion("\n\n   \n")).toBeNull();
    expect(parseNixVersion("command not found")).toBeNull();
  });

  it("parseDeterminateVersion reads the product version, with or without a v", () => {
    expect(parseDeterminateVersion(NIX_DETERMINATE_VERSION)).toBe("3.21.9");
    expect(parseDeterminateVersion("nix (Determinate Nix v3.22) 2.35.1")).toBe("3.22");
  });

  it("parseDeterminateVersion is null on an upstream build and on blank input", () => {
    expect(parseDeterminateVersion(NIX_UPSTREAM_VERSION)).toBeNull();
    expect(parseDeterminateVersion("nix (Determinate Nix) 2.35.1")).toBeNull();
    expect(parseDeterminateVersion("")).toBeNull();
  });

  it("highestStableTag ignores order, pre-releases and pointer tags", () => {
    expect(highestStableTag(["2.28.3", "2.30.0", "2.9.0"])).toBe("2.30.0");
    expect(highestStableTag([" 2.30.0 ", "2.31.0-pre", "latest", "2.18"])).toBe("2.30.0");
    expect(highestStableTag([])).toBeNull();
    expect(highestStableTag(["", "nightly"])).toBeNull();
  });

  it("compareNumericVersions sorts 1.10 above 1.9", () => {
    expect(compareNumericVersions("1.10", "1.9")).toBeGreaterThan(0);
    expect(compareNumericVersions("1.9", "1.10")).toBeLessThan(0);
    expect(compareNumericVersions("2.28.3", "2.28.3")).toBe(0);
    // A leading `v` is stripped and a missing component counts as 0.
    expect(compareNumericVersions("v2.30.0", "2.30")).toBe(0);
    expect(compareNumericVersions("v2.30.1", "2.30")).toBeGreaterThan(0);
    expect(compareNumericVersions("2.30", "2.30.1")).toBeLessThan(0);
    expect(compareNumericVersions("2.x", "2.0")).toBe(0);
  });
});
