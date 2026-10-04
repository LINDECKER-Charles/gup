import { describe, expect, it } from "vitest";
import { FastlaneProvider } from "../../../src/providers/embedded-mobile/fastlane.js";
import { system } from "../../support/system/fake-system.js";
import { fastlaneMachine, rubygemsLatest } from "./sdks.cases.js";

describe("FastlaneProvider.listOutdated", () => {
  it("reads a `v`-prefixed version line, the plugins listed after it ignored", async () => {
    const machine = fastlaneMachine("fastlane v2.220.0\nplugin foo 1.0.0");
    await system.load({ ...machine, http: [rubygemsLatest("2.221.0")] });
    await expect(new FastlaneProvider().listOutdated()).resolves.toEqual([
      { id: "fastlane", name: "Fastlane", current: "2.220.0", latest: "2.221.0" },
    ]);
  });
});
