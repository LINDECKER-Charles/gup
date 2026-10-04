import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { BorderChars } from "@opentui/core";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { chartGlyphs } from "../../../src/ui/charts/chart-glyphs.js";
import {
  ASCII_BORDER_CHARS,
  resolveGlyphMode,
  STATUS_GLYPHS,
  toAscii,
} from "../../../src/ui/theme/glyphs.js";
import { SAFE_TERMINAL_GLYPHS } from "../../support/tui/safe-terminal-glyphs.js";

const SRC_ROOT = join(import.meta.dirname, "../../../src");
const UI_ROOT = join(SRC_ROOT, "ui");
/** The HTML report: a browser draws it, falling back to another font for a missing symbol. */
const BROWSER_ROOT = join(SRC_ROOT, "report");
/** The ASCII map translates symbols gup may receive, drawable or not. */
const GLYPH_TABLE = join(UI_ROOT, "theme", "glyphs.ts");
/** Written at the head of exported files and stripped when reading them, never drawn. */
const BYTE_ORDER_MARK = "\uFEFF";
/** A symbol that needs a stand-in: not ASCII, not a letter or an accent (F-8). */
const SYMBOL = /[^\p{L}\p{M}\x00-\x7F]/u;
const isAscii = (text: string): boolean => [...text].every((c) => c.charCodeAt(0) <= 0x7f);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.name.endsWith(".ts") ? [path] : [];
  });
}

/** The symbols of `text` that a console font may not draw. */
const unsafeSymbols = (text: string): string[] =>
  [...text].filter((char) => SYMBOL.test(char) && !SAFE_TERMINAL_GLYPHS.has(char));
const codePoint = (char: string): string =>
  `U+${char.codePointAt(0)?.toString(16).toUpperCase().padStart(4, "0")}`;

/** Text of every string and template literal of a file — comments excluded. */
function literalsOf(file: string): string[] {
  const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest);
  const found: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isStringLiteralLike(node) || ts.isTemplateLiteralToken(node)) found.push(node.text);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

describe("toAscii", () => {
  it("gives every status glyph a one-column ASCII stand-in", () => {
    const glyphs = Object.values(STATUS_GLYPHS).flat();
    for (const glyph of glyphs) {
      const ascii = toAscii(glyph);
      expect(ascii, glyph).toHaveLength(glyph.length);
      expect(isAscii(ascii), `${glyph} → ${ascii}`).toBe(true);
      expect(ascii, glyph).not.toBe(glyph);
    }
  });

  it("keeps the width of a line and leaves French text alone", () => {
    const line = "▌ Paquets  √ à jour · ↑↓ naviguer — « échap » …";
    const ascii = toAscii(line);
    expect(ascii).toHaveLength(line.length);
    expect(ascii).toBe('| Paquets  + à jour . ^v naviguer - " échap " .');
  });

  it("maps every symbol a terminal-rendered string literal of src/ui uses", () => {
    const missing = new Set<string>();
    for (const file of sourceFiles(UI_ROOT)) {
      for (const literal of literalsOf(file)) {
        for (const char of literal) {
          if (SYMBOL.test(char) && toAscii(char) === char) {
            missing.add(`${char} (U+${char.codePointAt(0)?.toString(16)}) in ${relative(UI_ROOT, file)}`);
          }
        }
      }
    }
    expect([...missing]).toEqual([]);
  });
});

describe("Unicode glyphs", () => {
  it("draws every status mark and spinner frame with a symbol the console fonts have", () => {
    expect(unsafeSymbols(Object.values(STATUS_GLYPHS).flat().join(""))).toEqual([]);
  });

  it("turns the spinner through distinct frames, in ASCII too", () => {
    const frames = STATUS_GLYPHS.running;
    expect(new Set(frames).size).toBe(frames.length);
    expect(frames.map(toAscii)).toEqual(["|", "/", "-", "\\"]);
  });

  it("draws charts and borders with such symbols", () => {
    const { heat, full, partials, spark } = chartGlyphs("unicode");
    const borders = Object.values(BorderChars).flatMap((chars) => Object.values(chars));
    expect(unsafeSymbols([...heat, full, ...partials, ...spark, ...borders].join(""))).toEqual([]);
  });

  it("keeps every string literal drawn in a terminal to such symbols", () => {
    const unsafe = new Set<string>();
    const files = sourceFiles(SRC_ROOT).filter(
      (file) => !file.startsWith(BROWSER_ROOT) && file !== GLYPH_TABLE,
    );
    for (const file of files) {
      const symbols = unsafeSymbols(literalsOf(file).join("")).filter((c) => c !== BYTE_ORDER_MARK);
      for (const char of symbols) {
        unsafe.add(`${char} (${codePoint(char)}) in ${relative(SRC_ROOT, file)}`);
      }
    }
    expect([...unsafe]).toEqual([]);
  });
});

describe("ASCII borders", () => {
  it("draws boxes in ASCII, focus distinct from idle without colour", () => {
    const { idle, focus } = ASCII_BORDER_CHARS;
    expect(Object.values(idle).every(isAscii)).toBe(true);
    expect(Object.values(focus).every(isAscii)).toBe(true);
    expect(focus.horizontal).not.toBe(idle.horizontal);
    expect(focus.topLeft).not.toBe(idle.topLeft);
  });
});

describe("resolveGlyphMode", () => {
  const UTF8 = { LANG: "fr_FR.UTF-8" };

  it("follows an explicit preference whatever the terminal", () => {
    expect(resolveGlyphMode("ascii", UTF8, "darwin")).toBe("ascii");
    expect(resolveGlyphMode("unicode", { TERM: "linux" }, "linux")).toBe("unicode");
  });

  it("picks ASCII on request or on terminals that lack the symbols", () => {
    expect(resolveGlyphMode("auto", { GUP_ASCII: "1" }, "win32")).toBe("ascii");
    expect(resolveGlyphMode("auto", { ...UTF8, TERM: "linux" }, "linux")).toBe("ascii");
    expect(resolveGlyphMode("auto", { ...UTF8, TERM: "dumb" }, "darwin")).toBe("ascii");
  });

  it("needs a UTF-8 locale on POSIX, LC_ALL first, then LC_CTYPE, then LANG", () => {
    expect(resolveGlyphMode("auto", UTF8, "darwin")).toBe("unicode");
    expect(resolveGlyphMode("auto", { LC_CTYPE: "en_US.utf8" }, "linux")).toBe("unicode");
    expect(resolveGlyphMode("auto", {}, "linux")).toBe("ascii");
    expect(resolveGlyphMode("auto", { ...UTF8, LC_ALL: "C" }, "linux")).toBe("ascii");
  });

  it("keeps Unicode on Windows consoles, which need no locale", () => {
    expect(resolveGlyphMode("auto", {}, "win32")).toBe("unicode");
  });
});
