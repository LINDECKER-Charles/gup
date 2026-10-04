import * as fs from "node:fs";
import * as os from "node:os";
import { describe, expect, it } from "vitest";
import * as runner from "../../../src/core/runner.js";
import {
  compareVersions,
  parseAppcastVersions,
  SparkleProvider,
} from "../../../src/providers/os/sparkle.js";
import { replaceForTest } from "../../support/system/boundary-spy.js";
import { system } from "../../support/system/fake-system.js";
import type { HttpRoute, SimPlatform } from "../../support/system/types.js";
import { probeArgvs } from "../../support/system/trace.js";
import {
  APPCAST_ATTRIBUTE_SHAPE,
  APPCAST_ELEMENT_SHAPE,
  ITERM_FEED,
  ITERM_PLIST,
  PLUTIL_BIN,
  type PlistKeys,
  sparkleMachine,
  TRANSMIT_FEED,
  TRANSMIT_PLIST,
} from "./posix.cases.js";

/**
 * Sparkle: every .app bundle whose Info.plist carries an `SUFeedURL` is
 * compared against its appcast — over TLS only, like with like (marketing
 * version, or build number), and reported, never applied.
 */

const TRANSMIT_5_10_3: PlistKeys = {
  SUFeedURL: TRANSMIT_FEED,
  CFBundleShortVersionString: "5.10.3",
};

/** Transmit at 5.10.3, its feed answered by `route` overrides. */
function transmitMachine(route: Partial<HttpRoute> = {}): ReturnType<typeof sparkleMachine> {
  return sparkleMachine({ [TRANSMIT_PLIST]: TRANSMIT_5_10_3 }, [
    { url: TRANSMIT_FEED, body: APPCAST_ELEMENT_SHAPE, ...route },
  ]);
}

function plistOf(app: string): string {
  return `/Applications/${app}.app/Contents/Info.plist`;
}

describe("SparkleProvider.listOutdated off macOS", () => {
  it.each<SimPlatform>(["linux", "win32"])(
    "runs no plutil and walks no directory on %s",
    async (platform) => {
      await system.load({ platform, bin: { plutil: platform === "win32" ? "C:\\x\\plutil.exe" : PLUTIL_BIN } });
      await expect(new SparkleProvider().listOutdated()).resolves.toEqual([]);
      expect(system.trace.fsReads).toEqual([]);
      expect(system.trace.spawns).toEqual([]);
    },
  );
});

describe("SparkleProvider.isAvailable", () => {
  it("degrades to false when the plutil probe throws", async () => {
    await system.load(sparkleMachine({}));
    replaceForTest(runner, "commandExists", () => Promise.reject(new Error("nope")));
    await expect(new SparkleProvider().isAvailable()).resolves.toBe(false);
  });
});

describe("SparkleProvider.listOutdated: what is compared", () => {
  it("says nothing about an app already on the advertised version", async () => {
    await system.load(
      sparkleMachine({ [TRANSMIT_PLIST]: { ...TRANSMIT_5_10_3, CFBundleShortVersionString: "5.10.4" } }, [
        { url: TRANSMIT_FEED, body: APPCAST_ELEMENT_SHAPE },
      ]),
    );
    await expect(new SparkleProvider().listOutdated()).resolves.toEqual([]);
  });

  it("compares builds when neither side carries a marketing version", async () => {
    const feed = "https://feeds.example.com/build.xml";
    await system.load(
      sparkleMachine({ [plistOf("Build")]: { SUFeedURL: feed, CFBundleVersion: "100" } }, [
        {
          url: feed,
          body: "<rss><channel><item><title>b102</title><sparkle:version>102</sparkle:version></item></channel></rss>",
        },
      ]),
    );
    await expect(new SparkleProvider().listOutdated()).resolves.toEqual([
      {
        id: "Build",
        name: "Build",
        current: "100",
        latest: "102",
        note: "Sparkle — comparaison sur le build, updater intégré à l'app",
      },
    ]);
  });

  it("refuses a bare counter against a three-part marketing version", async () => {
    await system.load(
      sparkleMachine({ [ITERM_PLIST]: { SUFeedURL: ITERM_FEED, CFBundleVersion: "100" } }, [
        {
          url: ITERM_FEED,
          body: '<rss><channel><item><enclosure sparkle:version="3.6.11" url="https://iterm2.com/x.zip"/></item></channel></rss>',
        },
      ]),
    );
    await expect(new SparkleProvider().listOutdated()).resolves.toEqual([]);
  });

  it("says nothing when the feed carries no version at all", async () => {
    await system.load(transmitMachine({ body: "<rss><channel><title>empty</title></channel></rss>" }));
    await expect(new SparkleProvider().listOutdated()).resolves.toEqual([]);
  });
});

describe("SparkleProvider.listOutdated: which feeds are trusted", () => {
  it("costs exactly one plutil call for a bundle with no SUFeedURL", async () => {
    await system.load(sparkleMachine({ [plistOf("Calculator")]: {} }));
    await expect(new SparkleProvider().listOutdated()).resolves.toEqual([]);
    expect(probeArgvs()).toHaveLength(1);
    expect(system.trace.requests).toEqual([]);
  });

  it.each([
    ["a cleartext feed", "http://updates.example.com/legacy.xml"],
    ["an unparsable SUFeedURL", "not a url at all"],
  ])("drops %s before it reaches the network", async (_kind, url) => {
    await system.load(
      sparkleMachine({ [plistOf("Legacy")]: { SUFeedURL: url, CFBundleShortVersionString: "1.0.0" } }),
    );
    await expect(new SparkleProvider().listOutdated()).resolves.toEqual([]);
    expect(system.trace.requests).toEqual([]);
  });

  it("drops a bundle whose plist has no version keys at all", async () => {
    const feed = "https://feeds.example.com/broken.xml";
    await system.load(sparkleMachine({ [plistOf("Broken")]: { SUFeedURL: feed } }));
    await expect(new SparkleProvider().listOutdated()).resolves.toEqual([]);
    expect(system.trace.requests).toEqual([]);
  });

  it("drops a bundle whose plutil prints an empty value", async () => {
    await system.load(sparkleMachine({ [plistOf("Blank")]: { SUFeedURL: "   " } }));
    await expect(new SparkleProvider().listOutdated()).resolves.toEqual([]);
    expect(system.trace.requests).toEqual([]);
  });

  it("drops a feed whose redirect chain left TLS behind", async () => {
    await system.load(transmitMachine({ finalUrl: "http://mirror.example.com/feed.xml" }));
    await expect(new SparkleProvider().listOutdated()).resolves.toEqual([]);
  });

  it("drops a response declaring an implausible size", async () => {
    await system.load(transmitMachine({ headers: { "content-length": "999999999" } }));
    await expect(new SparkleProvider().listOutdated()).resolves.toEqual([]);
  });

  it("ignores a non-numeric content-length and reads the body anyway", async () => {
    await system.load(transmitMachine({ headers: { "content-length": "chunked" } }));
    const [row] = await new SparkleProvider().listOutdated();
    expect(row?.latest).toBe("5.10.4");
  });
});

describe("SparkleProvider.listOutdated: the bundle walk", () => {
  it("dedupes by bundle name — the first directory listed wins", async () => {
    const shadow = "/Users/u/Applications/Shadowed.app/Contents/Info.plist";
    await system.load({
      ...sparkleMachine({ [plistOf("Shadowed")]: {} }),
      fs: { [plistOf("Shadowed")]: { kind: "file" }, [shadow]: { kind: "file" } },
    });
    await expect(new SparkleProvider().listOutdated()).resolves.toEqual([]);
    expect(probeArgvs()).toEqual([
      ["plutil", "-extract", "SUFeedURL", "raw", "-o", "-", plistOf("Shadowed")],
    ]);
  });

  it.each([
    ["is unresolvable", () => { throw new Error("no passwd entry"); }],
    ["answers with an empty string", () => ""],
  ])("skips the home directory when homedir %s", async (_case, homedir) => {
    const ghost = "/Users/u/Applications/Ghost.app/Contents/Info.plist";
    await system.load({ ...sparkleMachine({}), fs: { [ghost]: { kind: "file" } } });
    replaceForTest(os, "homedir", homedir);
    await expect(new SparkleProvider().listOutdated()).resolves.toEqual([]);
    expect(system.trace.fsReads).toEqual(["/Applications", "/Applications/Utilities"]);
  });

  it("does not walk a directory that does not exist", async () => {
    await system.load(sparkleMachine({}));
    await expect(new SparkleProvider().listOutdated()).resolves.toEqual([]);
    // One existence probe per root, and no listing.
    expect(system.trace.fsReads).toEqual([
      "/Applications",
      "/Applications/Utilities",
      "/Users/u/Applications",
    ]);
  });

  it("survives an unreadable directory", async () => {
    await system.load(transmitMachine());
    system.inject({ on: "fs", path: "/Applications", mode: "eacces" });
    await expect(new SparkleProvider().listOutdated()).resolves.toEqual([]);
  });

  it("skips a bundle with no Info.plist", async () => {
    await system.load({ ...sparkleMachine({}), fs: { "/Applications/Empty.app": { kind: "dir" } } });
    await expect(new SparkleProvider().listOutdated()).resolves.toEqual([]);
    expect(probeArgvs()).toEqual([]);
  });

  it("keeps scanning when the plist probe itself throws", async () => {
    await system.load(transmitMachine());
    const existsSync = fs.existsSync;
    replaceForTest(fs, "existsSync", (path) => {
      if (String(path).endsWith("/Contents/Info.plist")) throw new Error("EIO");
      return existsSync(path);
    });
    await expect(new SparkleProvider().listOutdated()).resolves.toEqual([]);
    expect(probeArgvs()).toEqual([]);
  });

  it("keeps the other bundles when one bundle's plutil call is refused", async () => {
    await system.load(
      sparkleMachine({ [plistOf("Weird")]: {}, [TRANSMIT_PLIST]: TRANSMIT_5_10_3 }, [
        { url: TRANSMIT_FEED, body: APPCAST_ELEMENT_SHAPE },
      ]),
    );
    const weirdProbe = ["plutil", "-extract", "SUFeedURL", "raw", "-o", "-", plistOf("Weird")];
    system.inject({ on: "spawn", argv: weirdProbe, mode: "rejects" });
    const rows = await new SparkleProvider().listOutdated();
    expect(rows.map((row) => row.id)).toEqual(["Transmit"]);
  });

  it("caps the walk at 200 bundles", async () => {
    const apps = Array.from({ length: 250 }, (_, index) => `App${index}`);
    await system.load(sparkleMachine(Object.fromEntries(apps.map((app) => [plistOf(app), {}]))));
    await expect(new SparkleProvider().listOutdated()).resolves.toEqual([]);
    expect(probeArgvs()).toHaveLength(200);
  });

  it("returns [] rather than throwing when every filesystem probe fails", async () => {
    await system.load(transmitMachine());
    replaceForTest(fs, "existsSync", () => {
      throw new Error("EIO");
    });
    await expect(new SparkleProvider().listOutdated()).resolves.toEqual([]);
  });
});

describe("parseAppcastVersions", () => {
  it("reads the element shape", () => {
    expect(parseAppcastVersions(APPCAST_ELEMENT_SHAPE)).toEqual({ short: "5.10.4", build: "5104" });
  });

  it("reads the enclosure-attribute shape", () => {
    expect(parseAppcastVersions(APPCAST_ATTRIBUTE_SHAPE)).toEqual({
      short: "3.5.14",
      build: "3.5.14",
    });
  });

  it("is null on blank and garbage input", () => {
    expect(parseAppcastVersions("")).toBeNull();
    expect(parseAppcastVersions("not xml at all")).toBeNull();
    expect(parseAppcastVersions("<rss><channel></channel></rss>")).toBeNull();
  });

  it("compares items instead of trusting document order", () => {
    const ascending = `<rss><channel>
      <item><sparkle:shortVersionString>1.0.0</sparkle:shortVersionString></item>
      <item><sparkle:shortVersionString>1.10.0</sparkle:shortVersionString></item>
      <item><sparkle:shortVersionString>1.9.0</sparkle:shortVersionString></item>
    </channel></rss>`;
    expect(parseAppcastVersions(ascending)).toEqual({ short: "1.10.0" });
  });

  it("skips items gated behind a sparkle:channel", () => {
    const withBeta = `<rss><channel>
      <item>
        <sparkle:channel>beta</sparkle:channel>
        <sparkle:shortVersionString>6.0.0</sparkle:shortVersionString>
      </item>
      <item><sparkle:shortVersionString>5.10.4</sparkle:shortVersionString></item>
    </channel></rss>`;
    expect(parseAppcastVersions(withBeta)).toEqual({ short: "5.10.4" });
  });

  it("unwraps CDATA", () => {
    const cdata = `<rss><channel><item>
      <sparkle:shortVersionString><![CDATA[2.5.1]]></sparkle:shortVersionString>
    </item></channel></rss>`;
    expect(parseAppcastVersions(cdata)).toEqual({ short: "2.5.1" });
  });

  it("refuses a capture that is markup rather than a version", () => {
    const markup = `<rss><channel><item>
      <sparkle:version><b>1</b></sparkle:version>
      <sparkle:shortVersionString></sparkle:shortVersionString>
    </item></channel></rss>`;
    expect(parseAppcastVersions(markup)).toBeNull();
  });

  it("never mistakes a sibling element for an item", () => {
    const sibling = `<rss><channel>
      <itemcount>3</itemcount>
      <item><sparkle:shortVersionString>1.2.3</sparkle:shortVersionString></item>
    </channel></rss>`;
    expect(parseAppcastVersions(sibling)).toEqual({ short: "1.2.3" });
  });

  it("stops at an unclosed item instead of spinning", () => {
    expect(parseAppcastVersions("<item><item><item".repeat(500))).toBeNull();
  });

  it("orders build-only items against each other", () => {
    const builds = `<rss><channel>
      <item><sparkle:version>5103</sparkle:version></item>
      <item><sparkle:version>5104</sparkle:version></item>
    </channel></rss>`;
    expect(parseAppcastVersions(builds)).toEqual({ build: "5104" });
  });

  it("keeps the first item when two items share no comparable flavour", () => {
    const mixed = `<rss><channel>
      <item><sparkle:shortVersionString>1.0.0</sparkle:shortVersionString></item>
      <item><sparkle:version>9999</sparkle:version></item>
    </channel></rss>`;
    expect(parseAppcastVersions(mixed)).toEqual({ short: "1.0.0" });
  });

  it("stops reading after 200 items", () => {
    const items = Array.from(
      { length: 205 },
      (_, index) =>
        `<item><sparkle:shortVersionString>1.0.${index + 1}</sparkle:shortVersionString></item>`,
    ).join("");
    expect(parseAppcastVersions(`<rss><channel>${items}</channel></rss>`)).toEqual({
      short: "1.0.200",
    });
  });
});

describe("sparkle compareVersions", () => {
  it("sorts 1.10 above 1.9", () => {
    expect(compareVersions("1.10", "1.9")).toBe(1);
    expect(compareVersions("1.9", "1.10")).toBe(-1);
  });

  it("treats every separator alike and ignores a pre-release suffix", () => {
    expect(compareVersions("v2.1", "2_1")).toBe(0);
    expect(compareVersions("2.0-beta1", "2.0")).toBe(0);
    expect(compareVersions("2.0+build9", "2.0")).toBe(0);
  });

  it("pads missing components with zero", () => {
    expect(compareVersions("5.10", "5.10.0")).toBe(0);
    expect(compareVersions("5.10.1", "5.10")).toBe(1);
  });
});
