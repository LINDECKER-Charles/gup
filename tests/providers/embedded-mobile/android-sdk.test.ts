import { describe, expect, it } from "vitest";
import { AndroidSdkProvider } from "../../../src/providers/embedded-mobile/android-sdk.js";
import { system } from "../../support/system/fake-system.js";
import { sdkManagerMachine } from "./sdks.cases.js";

/** `sdkmanager --list`: only the "Available Updates:" table, up to the next blank line, is read. */

const listed = () => new AndroidSdkProvider().listOutdated();

describe("AndroidSdkProvider.listOutdated", () => {
  it("lists nothing without an Available Updates section", async () => {
    await system.load(
      sdkManagerMachine("Installed packages:\nplatform-tools | 34.0.0\n\nAvailable Packages:\n"),
    );
    await expect(listed()).resolves.toEqual([]);
  });

  it("skips a row with an empty column", async () => {
    const stdout = [
      "Available Updates:",
      "Id | Installed | Available",
      "platform-tools |  | 34.0.0",
      " | 33.0.0 | 34.0.0",
      "platform-tools | 33.0.0 | ",
    ].join("\n");
    await system.load(sdkManagerMachine(stdout));
    await expect(listed()).resolves.toEqual([]);
  });

  it("reads to the end when no blank line closes the section", async () => {
    const stdout = "Available Updates:\nId | Installed | Available\nplatform-tools | 33.0.0 | 34.0.0";
    await system.load(sdkManagerMachine(stdout));
    await expect(listed()).resolves.toMatchObject([{ id: "platform-tools", latest: "34.0.0" }]);
  });
});
