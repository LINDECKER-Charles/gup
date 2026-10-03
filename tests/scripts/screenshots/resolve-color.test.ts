import { RGBA } from "@opentui/core";
import { describe, expect, it } from "vitest";
import type { Hex, TerminalPalette } from "../../../scripts/screenshots/render/docs-palette.js";
import { resolveColor } from "../../../scripts/screenshots/render/resolve-color.js";

const PALETTE: TerminalPalette = {
  name: "test",
  foreground: "#eeeeee",
  background: "#111111",
  ansi: Array.from({ length: 16 }, (_, slot) => `#0000${slot.toString(16).padStart(2, "0")}` as Hex),
  chrome: { bar: "#222222", edge: "#333333", title: "#444444" },
};

describe("resolveColor", () => {
  it("maps the 16 ANSI slots through the palette, as the terminal's theme does", () => {
    expect(resolveColor(RGBA.fromIndex(3), "fg", PALETTE)).toBe("#000003");
    expect(resolveColor(RGBA.fromIndex(8), "bg", PALETTE)).toBe("#000008");
  });

  it("takes the xterm-256 value above slot 15", () => {
    expect(resolveColor(RGBA.fromIndex(200), "fg", PALETTE)).toBe("#ff00d7");
  });

  it("reads the default colour as the palette foreground, or the terminal background", () => {
    expect(resolveColor(RGBA.defaultForeground(), "fg", PALETTE)).toBe("#eeeeee");
    expect(resolveColor(RGBA.defaultBackground(), "bg", PALETTE)).toBeNull();
  });

  it("reads a fully transparent colour as the default", () => {
    const transparent = RGBA.fromInts(0, 0, 0, 0);
    expect(resolveColor(transparent, "fg", PALETTE)).toBe("#eeeeee");
    expect(resolveColor(transparent, "bg", PALETTE)).toBeNull();
  });

  it("keeps a literal colour, OpenTUI's implicit white text included", () => {
    expect(resolveColor(RGBA.fromInts(18, 52, 86), "bg", PALETTE)).toBe("#123456");
    expect(resolveColor(RGBA.fromValues(1, 1, 1, 1), "fg", PALETTE)).toBe("#ffffff");
  });
});
