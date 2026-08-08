import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { join } from "node:path";

/**
 * historyLocation() picks the platform data root, so `process.platform` and
 * `homedir()` both have to be forced. Expectations are built with the *host*
 * joiner (plain `join`), which is what the source uses too — unlike the
 * Windows-only providers, the history has no reason to emit Windows
 * separators from a Linux process.
 */
const { homedirMock } = vi.hoisted(() => ({ homedirMock: vi.fn(() => "/home/u") }));
vi.mock("node:os", () => ({ homedir: homedirMock }));

import { historyLocation } from "../../src/core/history/paths.js";

const REFERENCE_DATE = new Date("2026-08-08T22:30:00.000Z");
const ENV_KEYS = ["GUP_HISTORY_DIR", "LOCALAPPDATA", "XDG_STATE_HOME", "HOME"] as const;

const originalPlatform = process.platform;
let savedEnv: Record<string, string | undefined>;

function setPlatform(value: string): void {
  Object.defineProperty(process, "platform", { value, configurable: true });
}

beforeEach(() => {
  savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const key of ENV_KEYS) delete process.env[key];
  homedirMock.mockReturnValue("/home/u");
});

afterEach(() => {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  setPlatform(originalPlatform);
});

describe("historyLocation", () => {
  it("shards per UTC month, whatever the local offset", () => {
    process.env["GUP_HISTORY_DIR"] = join("/tmp", "h");
    const location = historyLocation(REFERENCE_DATE);
    expect(location).toEqual({
      dir: join("/tmp", "h"),
      file: join("/tmp", "h", "2026-08.jsonl"),
    });
  });

  it("lets GUP_HISTORY_DIR win over the platform default", () => {
    setPlatform("win32");
    process.env["LOCALAPPDATA"] = "C:\\Users\\u\\AppData\\Local";
    process.env["GUP_HISTORY_DIR"] = join("/elsewhere");
    expect(historyLocation(REFERENCE_DATE)?.dir).toBe(join("/elsewhere"));
  });

  it("anchors on %LOCALAPPDATA% on Windows", () => {
    setPlatform("win32");
    process.env["LOCALAPPDATA"] = "C:\\Users\\u\\AppData\\Local";
    expect(historyLocation(REFERENCE_DATE)?.dir).toBe(
      join("C:\\Users\\u\\AppData\\Local", "gup", "history"),
    );
  });

  it("disables itself on Windows when %LOCALAPPDATA% is missing", () => {
    setPlatform("win32");
    expect(historyLocation(REFERENCE_DATE)).toBeNull();
  });

  it("anchors on ~/Library/Application Support on macOS", () => {
    setPlatform("darwin");
    expect(historyLocation(REFERENCE_DATE)?.dir).toBe(
      join("/home/u", "Library", "Application Support", "gup", "history"),
    );
  });

  it("prefers $XDG_STATE_HOME elsewhere", () => {
    setPlatform("linux");
    process.env["XDG_STATE_HOME"] = join("/home/u", ".state");
    expect(historyLocation(REFERENCE_DATE)?.dir).toBe(
      join("/home/u", ".state", "gup", "history"),
    );
  });

  it("falls back to ~/.local/state without $XDG_STATE_HOME", () => {
    setPlatform("linux");
    expect(historyLocation(REFERENCE_DATE)?.dir).toBe(
      join("/home/u", ".local", "state", "gup", "history"),
    );
  });

  it("falls back to $HOME when homedir() has nothing to offer", () => {
    setPlatform("linux");
    homedirMock.mockReturnValue("");
    process.env["HOME"] = "/mnt/u";
    expect(historyLocation(REFERENCE_DATE)?.dir).toBe(
      join("/mnt/u", ".local", "state", "gup", "history"),
    );
  });

  it("returns null when no home can be resolved at all", () => {
    setPlatform("linux");
    homedirMock.mockReturnValue("");
    expect(historyLocation(REFERENCE_DATE)).toBeNull();
  });
});
