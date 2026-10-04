import { join, win32 } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { historyLocation } from "../../../src/core/history/paths.js";
import { restorePlatform, setPlatform } from "../../support/platform.js";

/**
 * Where the history shards go. The directory itself is `stateDir("history")`,
 * whose roots, overrides and fallbacks per platform are pinned in
 * tests/core/state/app-dirs.test.ts; this suite holds what the history adds:
 * one shard per UTC month, named with the platform's separators, and no
 * history at all without an anchor.
 */
const REFERENCE_DATE = new Date("2026-08-08T22:30:00.000Z");

afterEach(() => {
  vi.unstubAllEnvs();
  restorePlatform();
});

describe("historyLocation", () => {
  it("shards per UTC month, whatever the local offset", () => {
    vi.stubEnv("GUP_HISTORY_DIR", join("/tmp", "h"));
    expect(historyLocation(REFERENCE_DATE)).toEqual({
      dir: join("/tmp", "h"),
      file: join("/tmp", "h", "2026-08.jsonl"),
    });
  });

  it("names the shard with the platform's separators", () => {
    setPlatform("win32");
    vi.stubEnv("GUP_HISTORY_DIR", "");
    vi.stubEnv("LOCALAPPDATA", "C:\\Users\\u\\AppData\\Local");
    const dir = win32.join("C:\\Users\\u\\AppData\\Local", "gup", "history");
    expect(historyLocation(REFERENCE_DATE)).toEqual({
      dir,
      file: win32.join(dir, "2026-08.jsonl"),
    });
  });

  it("turns the history off when the platform offers no anchor", () => {
    setPlatform("win32");
    vi.stubEnv("GUP_HISTORY_DIR", "");
    vi.stubEnv("LOCALAPPDATA", "");
    expect(historyLocation(REFERENCE_DATE)).toBeNull();
  });
});
