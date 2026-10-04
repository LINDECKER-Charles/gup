import { describe, expect, it } from "vitest";
import * as runner from "../../../src/core/runner.js";
import { parseVcpkgUpdate, VcpkgProvider } from "../../../src/providers/lang-other/vcpkg.js";
import { replaceForTest } from "../../support/system/boundary-spy.js";
import { system } from "../../support/system/fake-system.js";
import type { SimPlatform } from "../../support/system/types.js";
import {
  VCPKG_MACHINE,
  VCPKG_REBUILD_NOTE,
  VCPKG_UPDATE_STDOUT,
} from "./lang-other.cases.js";

/**
 * vcpkg in classic mode: `vcpkg update` rows keyed on their untranslated
 * ` -> ` arrow, and `vcpkg upgrade` with the two flags that make it act and
 * report truthfully.
 */

const SPAWN_FAILURE = "impossible de lancer vcpkg upgrade";

describe("VcpkgProvider.isAvailable", () => {
  it.each<[SimPlatform, string]>([
    ["win32", "C:\\vcpkg\\vcpkg.exe"],
    ["darwin", "/opt/homebrew/bin/vcpkg"],
    ["linux", "/home/u/vcpkg/vcpkg"],
  ])("is a plain binary probe on %s — no platform gate", async (platform, path) => {
    await system.load({ platform, bin: { vcpkg: path } });
    await expect(new VcpkgProvider().isAvailable()).resolves.toBe(true);
  });

  it("never throws out of the detection Promise.all", async () => {
    await system.load(VCPKG_MACHINE);
    replaceForTest(runner, "commandExists", () => Promise.reject(new Error("PATH is on fire")));
    await expect(new VcpkgProvider().isAvailable()).resolves.toBe(false);
  });
});

describe("parseVcpkgUpdate", () => {
  it("keeps only the arrow rows, dropping preamble and both footers", () => {
    expect(parseVcpkgUpdate(VCPKG_UPDATE_STDOUT).map((row) => row.id)).toEqual([
      "corrade:x64-windows",
      "openal-soft:x64-windows",
    ]);
  });

  it("drops the header without matching on its (localisable) wording", () => {
    const headerOnly = [
      "Using local portfile versions. To update the local portfiles, use `git pull`.",
      "The following packages differ from their port versions:",
    ].join("\n");
    expect(parseVcpkgUpdate(headerOnly)).toEqual([]);
  });

  it("returns [] on the nothing-to-do message", () => {
    expect(parseVcpkgUpdate("No packages to update.\n")).toEqual([]);
  });

  it("returns [] on blank and garbage input", () => {
    expect(parseVcpkgUpdate("")).toEqual([]);
    expect(parseVcpkgUpdate("\n\n   \n")).toEqual([]);
    expect(parseVcpkgUpdate("error: something exploded")).toEqual([]);
  });

  it("keeps the triplet qualifier intact — that is the upgrade argument", () => {
    const rows = parseVcpkgUpdate("        zlib:x64-windows    1.2.13 -> 1.3.1");
    expect(rows[0]?.id).toBe("zlib:x64-windows");
    expect(rows[0]?.name).toBe("zlib:x64-windows");
  });

  it("handles CRLF output", () => {
    const rows = parseVcpkgUpdate(
      "The following packages differ from their port versions:\r\n        zlib:arm64-osx    1.2.13 -> 1.3.1\r\n",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.latest).toBe("1.3.1");
  });

  it("keeps a `version-string` port whose version text contains spaces", () => {
    // vcpkg pads the spec to 32 columns: the extra spaces belong to the version.
    expect(parseVcpkgUpdate("        libmariadb:x64-linux             3.1.13 rev 2 -> 3.3.8")).toEqual([
      {
        id: "libmariadb:x64-linux",
        name: "libmariadb:x64-linux",
        current: "3.1.13 rev 2",
        latest: "3.3.8",
        note: VCPKG_REBUILD_NOTE,
      },
    ]);
  });

  it("rejects a line whose left side is not a name:triplet spec", () => {
    expect(parseVcpkgUpdate("        zlib   1.2.13 -> 1.3.1")).toEqual([]);
    expect(parseVcpkgUpdate("        a:b:c   1.2.13 -> 1.3.1")).toEqual([]);
  });

  it("rejects an arrow row with no version on the left of the spec", () => {
    expect(parseVcpkgUpdate("zlib:x64-windows -> 1.3.1")).toEqual([]);
  });

  it("drops a row whose two versions are identical", () => {
    expect(parseVcpkgUpdate("        zlib:x64-windows    1.3.1 -> 1.3.1")).toEqual([]);
  });
});

describe("VcpkgProvider", () => {
  it("returns [] rather than throwing when the runner refuses vcpkg", async () => {
    await system.load(VCPKG_MACHINE);
    system.inject({ on: "spawn", argv: ["vcpkg", "update"], mode: "rejects" });
    await expect(new VcpkgProvider().listOutdated()).resolves.toEqual([]);
  });

  it("reports a failed upgrade without inventing a message", async () => {
    await system.load(VCPKG_MACHINE);
    system.answerInstall({ exitCode: 1 });
    await expect(new VcpkgProvider().update("zlib:x64-windows")).resolves.toEqual({
      id: "zlib:x64-windows",
      success: false,
    });
  });

  it("degrades an upgrade the runner refuses to a failed outcome, one by one or batched", async () => {
    await system.load(VCPKG_MACHINE);
    system.answerInstall({ rejects: true }, { rejects: true });
    const failure = { id: "zlib:x64-windows", success: false, message: SPAWN_FAILURE };
    await expect(new VcpkgProvider().update("zlib:x64-windows")).resolves.toEqual(failure);
    await expect(
      new VcpkgProvider().updateAll([{ id: "zlib:x64-windows", current: "1", latest: "2" }]),
    ).resolves.toEqual([failure]);
  });
});
