import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import {
  ASCII_BORDER_CHARS,
  resolveGlyphMode,
  STATUS_GLYPHS,
  toAscii,
} from "../../../src/ui/theme/glyphs.js";

const UI_ROOT = join(import.meta.dirname, "../../../src/ui");
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
    const line = "▌ Paquets  ✔ à jour · ↑↓ naviguer — « échap » …";
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
