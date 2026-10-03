import { describe, expect, it } from "vitest";
import { GemProvider, isAppleSystemRuby } from "../../../src/providers/lang-other/gem.js";
import { system } from "../../support/system/fake-system.js";
import type { SimPlatform } from "../../support/system/types.js";

/**
 * The Apple-system-Ruby guard: macOS ships a frozen, SIP-locked Ruby whose
 * stdlib gems `gem update` can never touch, so a gem resolving to it hides
 * the provider instead of flooding the scan with ~40 dead rows. And the
 * `gem outdated` lines the scan keeps.
 */

/** A machine whose `gem` resolves to `path` (or is absent). */
async function gemAt(platform: SimPlatform, path?: string): Promise<void> {
  await system.load({ platform, ...(path !== undefined && { bin: { gem: path } }) });
}

describe("isAppleSystemRuby", () => {
  it("is never true off macOS — Windows and Linux keep the previous behaviour", async () => {
    await gemAt("win32", "C:\\Ruby33-x64\\bin\\gem.cmd");
    await expect(isAppleSystemRuby()).resolves.toBe(false);
    await gemAt("linux", "/usr/bin/gem");
    await expect(isAppleSystemRuby()).resolves.toBe(false);
  });

  it("detects Apple's frozen interpreter", async () => {
    for (const path of [
      "/usr/bin/gem",
      "/System/Library/Frameworks/Ruby.framework/Versions/2.6/usr/bin/gem",
    ]) {
      await gemAt("darwin", path);
      await expect(isAppleSystemRuby()).resolves.toBe(true);
    }
  });

  it("leaves every managed Ruby alone", async () => {
    for (const path of [
      "/opt/homebrew/bin/gem",
      "/usr/local/bin/gem",
      "/Users/u/.rbenv/shims/gem",
      "/Users/u/.rvm/rubies/ruby-3.3.0/bin/gem",
      "/Users/u/.asdf/shims/gem",
    ]) {
      await gemAt("darwin", path);
      await expect(isAppleSystemRuby()).resolves.toBe(false);
    }
  });

  it("is conservative when gem does not resolve", async () => {
    await gemAt("darwin");
    await expect(isAppleSystemRuby()).resolves.toBe(false);
  });
});

describe("GemProvider.isAvailable", () => {
  it("hides itself on a Mac running Apple's system Ruby", async () => {
    await gemAt("darwin", "/usr/bin/gem");
    await expect(new GemProvider().isAvailable()).resolves.toBe(false);
  });

  it("stays available for a Homebrew or rbenv Ruby", async () => {
    await gemAt("darwin", "/opt/homebrew/bin/gem");
    await expect(new GemProvider().isAvailable()).resolves.toBe(true);
  });

  it("is unavailable when gem is absent", async () => {
    await gemAt("darwin");
    await expect(new GemProvider().isAvailable()).resolves.toBe(false);
  });
});

describe("GemProvider.listOutdated", () => {
  it("keeps only the `name (current < latest)` lines, whatever their padding", async () => {
    const stdout = [
      "rake (13.0.6 < 13.1.0)",
      "noise without parens",
      "",
      "  rails (7.0.0 < 7.1.0)  ",
    ].join("\n");
    await system.load({
      platform: "linux",
      bin: { gem: "/usr/bin/gem" },
      commands: [{ argv: ["gem", "outdated"], stdout }],
    });
    await expect(new GemProvider().listOutdated()).resolves.toEqual([
      { id: "rake", name: "rake", current: "13.0.6", latest: "13.1.0" },
      { id: "rails", name: "rails", current: "7.0.0", latest: "7.1.0" },
    ]);
  });
});
