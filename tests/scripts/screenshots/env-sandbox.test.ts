import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { enterSandbox } from "../../../scripts/screenshots/sandbox/env-sandbox.js";
import { resolveGlyphMode } from "../../../src/ui/theme/glyphs.js";

const DATA_DIRS = [
  "GUP_HISTORY_DIR",
  "GUP_CONFIG_DIR",
  "GUP_LOG_DIR",
  "GUP_REPORT_DIR",
  "GUP_SCHEDULER_DIR",
] as const;

describe("enterSandbox", () => {
  it("hides the developer's gup settings and moves every data directory to a temporary tree", () => {
    vi.stubEnv("GUP_ASCII", "1");
    vi.stubEnv("GUP_HISTORY_DIR", "/home/dev/.local/state/gup/history");
    const leave = enterSandbox();
    try {
      expect(process.env["GUP_ASCII"]).toBeUndefined();
      const dirs = DATA_DIRS.map((name) => process.env[name] ?? "");
      const roots = new Set(dirs.map((dir) => dirname(dir)));
      expect(roots.size).toBe(1);
      const [root = ""] = roots;
      expect(root.startsWith(tmpdir())).toBe(true);
      expect(existsSync(root)).toBe(true);
    } finally {
      leave();
    }
  });

  it("draws unicode glyphs whatever terminal or locale the host has", () => {
    vi.stubEnv("TERM", "dumb");
    vi.stubEnv("LC_ALL", "C");
    vi.stubEnv("NO_COLOR", "1");
    const leave = enterSandbox();
    try {
      expect(resolveGlyphMode("auto", process.env, "linux")).toBe("unicode");
      expect(process.env["NO_COLOR"]).toBeUndefined();
    } finally {
      leave();
    }
  });

  it("gives the environment back and deletes the tree when left", () => {
    const before = { ...process.env };
    const leave = enterSandbox();
    const root = dirname(process.env["GUP_CONFIG_DIR"] ?? "");
    leave();
    expect(existsSync(root)).toBe(false);
    expect({ ...process.env }).toEqual(before);
  });
});
