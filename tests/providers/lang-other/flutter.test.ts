import { describe, expect, it } from "vitest";
import { FlutterProvider } from "../../../src/providers/lang-other/flutter.js";
import { withRelease } from "../../support/contract/self-updating-tool.js";
import { system } from "../../support/system/fake-system.js";
import { flutterMachine, flutterReleases } from "./self-updating.cases.js";

/**
 * The Flutter SDK follows a channel: its version is compared with the release
 * the index names current for that channel, never with another channel's.
 */

const CURRENT = { stable: "s3243", beta: "b3250" };

describe("FlutterProvider.listOutdated", () => {
  it("compares a beta SDK with the beta channel's current release", async () => {
    const sdk = flutterMachine({ frameworkVersion: "3.24.0-0.2.pre", channel: "beta" });
    await system.load(withRelease(sdk, flutterReleases(CURRENT)));
    await expect(new FlutterProvider().listOutdated()).resolves.toEqual([
      {
        id: "flutter",
        name: "Flutter",
        current: "3.24.0-0.2.pre",
        latest: "3.25.0-0.1.pre",
        note: "channel beta",
      },
    ]);
  });

  it("reads the stable channel when the SDK does not name one", async () => {
    const sdk = flutterMachine({ frameworkVersion: "3.22.2" });
    await system.load(withRelease(sdk, flutterReleases(CURRENT)));
    const rows = await new FlutterProvider().listOutdated();
    expect(rows).toMatchObject([{ latest: "3.24.3", note: "channel stable" }]);
  });

  it("lists nothing, and fetches nothing, when the SDK reports no version", async () => {
    const sdk = flutterMachine({ channel: "stable" });
    await system.load(withRelease(sdk, flutterReleases(CURRENT)));
    await expect(new FlutterProvider().listOutdated()).resolves.toEqual([]);
    expect(system.trace.requests).toEqual([]);
  });

  it("lists nothing when the index has no current release for the channel", async () => {
    const sdk = flutterMachine({ frameworkVersion: "3.22.2", channel: "stable" });
    await system.load(withRelease(sdk, flutterReleases({ beta: "b3250" })));
    await expect(new FlutterProvider().listOutdated()).resolves.toEqual([]);
  });

  it("lists nothing when the channel's current hash names no release", async () => {
    const sdk = flutterMachine({ frameworkVersion: "3.22.2", channel: "stable" });
    await system.load(withRelease(sdk, flutterReleases({ stable: "unknown-hash" })));
    await expect(new FlutterProvider().listOutdated()).resolves.toEqual([]);
  });
});
