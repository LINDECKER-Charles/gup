import { homedir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CSV_COLUMNS, updatesToCsv } from "../../../src/core/export/csv.js";
import { scanEvent, updateEvent } from "../../support/history-fixtures.js";

const nameOf = (providerId: string) => (providerId === "winget" ? "Windows Package Manager" : providerId);

function rows(csv: string): string[] {
  return csv.slice(1).split("\r\n").slice(0, -1);
}

describe("updatesToCsv", () => {
  it("writes a BOM, an English snake_case header and one CRLF row per update attempt", () => {
    const csv = updatesToCsv(
      [
        updateEvent("winget", "Git.Git", { trigger: "menu", elevated: true, scheduleId: "s1" }),
        scanEvent(),
        updateEvent("pip", "rich", { status: "failed", durationMs: 1234, retry: "--force" }),
      ],
      { delimiter: ",", nameOf },
    );

    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv.endsWith("\r\n")).toBe(true);
    expect(rows(csv)).toEqual([
      CSV_COLUMNS.join(","),
      "2026-10-01T09:00:00.000Z,winget,Windows Package Manager,Git.Git,success,1.0.0,2.0.0,1000,,,true,00000000-0000-4000-8000-000000000001,menu,s1",
      "2026-10-01T09:00:00.000Z,pip,pip,rich,failed,1.0.0,2.0.0,1234,,'--force,false,00000000-0000-4000-8000-000000000001,,",
    ]);
  });

  it("quotes cells holding the delimiter, a quote or a line break", () => {
    const csv = updatesToCsv(
      [updateEvent("pip", "a,b", { message: 'said "no"\nthen left' })],
      { delimiter: ",", nameOf },
    );

    expect(rows(csv)[1]).toContain(',"a,b",');
    expect(csv).toContain('"said ""no""\nthen left"');
  });

  it.each(["=HYPERLINK(\"x\")", "+1", "-1+2", "@SUM(A1)", "\tcmd"])(
    "neutralises a cell starting like a formula: %j",
    (message) => {
      const [, row] = rows(updatesToCsv([updateEvent("pip", "rich", { message })], { delimiter: ";", nameOf }));
      expect(row!.split(";")[8]).toMatch(/^"?'/);
    },
  );

  it("separates with a semicolon or a tab on request", () => {
    const event = updateEvent("pip", "a;b", { message: "x\ty" });

    expect(rows(updatesToCsv([event], { delimiter: ";", nameOf }))[1]).toContain(';"a;b";');
    expect(rows(updatesToCsv([event], { delimiter: "\t", nameOf }))[1]).toContain('\t"x\ty"\t');
  });

  it("redacts secrets and shortens the home directory in free text", () => {
    const csv = updatesToCsv(
      [updateEvent("npm-g", "pkg", { message: `token=abc123secret in ${join(homedir(), "proj")}` })],
      { delimiter: ",", nameOf },
    );

    expect(csv).not.toContain("abc123secret");
    expect(csv).not.toContain(homedir());
    expect(csv).toContain("~");
  });

  it("writes only the header for a history without updates", () => {
    expect(updatesToCsv([scanEvent()], { delimiter: ",", nameOf })).toBe(`﻿${CSV_COLUMNS.join(",")}\r\n`);
  });
});
