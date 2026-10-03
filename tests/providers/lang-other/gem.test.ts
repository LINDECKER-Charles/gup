import { describe, expect, it } from "vitest";
import { GemProvider, isAppleSystemRuby } from "../../../src/providers/lang-other/gem.js";
import { system } from "../../support/system/fake-system.js";
import type { SimPlatform } from "../../support/system/types.js";

/**
 * The Apple-system-Ruby guard: macOS ships a frozen, SIP-locked Ruby whose
 * stdlib gems `gem update` can never touch, so a gem resolving to it hides
 * the provider instead of flooding the scan with ~40 dead rows.
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
