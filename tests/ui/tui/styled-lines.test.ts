import { describe, expect, it } from "vitest";
import {
  lineWidth,
  middleEllipsis,
  seg,
  wrapLine,
  type Line,
} from "../../../src/ui/tui/styled-lines.js";

const texts = (lines: readonly Line[]) => lines.map((line) => line.map((s) => s.text).join(""));

describe("wrapLine", () => {
  it("gives back a line that fits, as it is", () => {
    const line = [seg("⚠ ", "warning"), seg("court")];
    expect(wrapLine(line, 20)).toEqual([line]);
  });

  it("breaks between words, keeps every word and every tone, never starts a row blank", () => {
    const line = [seg("⚠ Le déclencheur n'a pas pu être modifié : ", "warning"), seg("accès refusé", "danger")];
    const rows = wrapLine(line, 20);
    expect(texts(rows)).toEqual(["⚠ Le déclencheur n'a", "pas pu être modifié", ": accès refusé"]);
    expect(rows.every((row) => lineWidth(row) <= 20)).toBe(true);
    expect(rows[2]?.map((s) => s.tone)).toEqual(["warning", "warning", "danger", "danger", "danger"]);
  });

  it("cuts a word wider than a row across rows, losing nothing", () => {
    const rows = texts(wrapLine([seg("voir C:\\gup\\scheduler\\install.json")], 12));
    expect(rows).toEqual(["voir", "C:\\gup\\sched", "uler\\install", ".json"]);
  });
});

describe("middleEllipsis", () => {
  it("cuts the middle of a long path, keeping more of its end", () => {
    const path = "~\\AppData\\Local\\gup\\reports\\gup-rapport-2026-10-04.html";
    const short = middleEllipsis(path, 40);
    expect(short).toHaveLength(40);
    expect(short).toBe("~\\AppData\\Loc…up-rapport-2026-10-04.html");
  });

  it("leaves a text that fits alone", () => {
    expect(middleEllipsis("~/rapport.html", 40)).toBe("~/rapport.html");
  });
});
