import { describe, expect, it } from "vitest";
import {
  compareVersions,
  parsePkgxVersion,
  PkgxProvider,
} from "../../../src/providers/os/pkgx.js";
import { system } from "../../support/system/fake-system.js";
import { PKGX_RELEASES_URL, pkgxMachine } from "./posix.cases.js";

/**
 * pkgx: the binary itself, against the newest stable release on the
 * installed major line — upstream publishes v1 maintenance releases out of
 * order with the v2 line, so "latest" alone would offer a downgrade.
 */

/** pkgx `installed` with the release list answering `tags`, newest first. */
async function loadReleases(installed: string, tags: readonly string[]): Promise<void> {
  const machine = pkgxMachine("/opt/homebrew/bin/pkgx");
  await system.load({
    ...machine,
    commands: [{ argv: ["pkgx", "--version"], stdout: `pkgx ${installed}\n` }],
    http: [{ url: PKGX_RELEASES_URL, json: tags.map((tag) => ({ tag_name: tag })) }],
  });
}

describe("PkgxProvider", () => {
  it("never reads a non-version tag as major 0", async () => {
    await loadReleases("0.9.0", ["nightly", "v0.9.1"]);
    const [row] = await new PkgxProvider().listOutdated();
    expect(row?.latest).toBe("0.9.1");
  });

  it("returns [] when the two spellings of the same release differ textually", async () => {
    await loadReleases("2.11.0", ["v2.11"]);
    await expect(new PkgxProvider().listOutdated()).resolves.toEqual([]);
  });

  it("returns [] when the feed answers with an older release", async () => {
    await loadReleases("2.11.0", ["v2.10.3"]);
    await expect(new PkgxProvider().listOutdated()).resolves.toEqual([]);
  });
});

describe("pkgx parsers", () => {
  it("parsePkgxVersion reads the single-line output", () => {
    expect(parsePkgxVersion("pkgx 2.11.0\n")).toBe("2.11.0");
    expect(parsePkgxVersion("  pkgx v2.11.0")).toBe("2.11.0");
    expect(parsePkgxVersion("pkgx 2.12.0-rc.1")).toBe("2.12.0-rc.1");
  });

  it("parsePkgxVersion anchors on a line start, never on a passing mention", () => {
    expect(parsePkgxVersion("warning: pkgx 9.9.9 is stale\npkgx 2.11.0")).toBe("2.11.0");
  });

  it("parsePkgxVersion is null on blank, garbage and a foreign binary", () => {
    expect(parsePkgxVersion("")).toBeNull();
    expect(parsePkgxVersion("???")).toBeNull();
    expect(parsePkgxVersion("pkgx version unknown")).toBeNull();
  });

  it("compareVersions sorts 1.10 above 1.9", () => {
    expect(compareVersions("1.10.0", "1.9.0")).toBe(1);
    expect(compareVersions("1.9.0", "1.10.0")).toBe(-1);
  });

  it("compareVersions treats 2.11 and 2.11.0 as the same release", () => {
    expect(compareVersions("2.11", "2.11.0")).toBe(0);
    expect(compareVersions("2.11.1", "2.11")).toBe(1);
    expect(compareVersions("2.11", "2.11.1")).toBe(-1);
  });

  it("compareVersions ranks a pre-release below its release, build metadata aside", () => {
    expect(compareVersions("2.12.0-rc.1", "2.12.0")).toBe(-1);
    expect(compareVersions("2.12.0", "2.12.0-rc.1")).toBe(1);
    expect(compareVersions("2.11.0+ci7", "2.11.0")).toBe(0);
    expect(compareVersions("2.12.0-rc.1", "2.12.0-rc.2")).toBe(0);
  });

  it("compareVersions maps an unparsable segment to zero", () => {
    expect(compareVersions("2.x", "2.0")).toBe(0);
  });
});
