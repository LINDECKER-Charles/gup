import { mkdtempSync, readdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  outputFileName,
  OutputExistsError,
  RETAINED_PER_KIND,
  writeOutputFile,
} from "../../../src/core/export/output-file.js";
import { useLocale } from "../../support/locale.js";

let dir: string;
const savedReportDir = process.env["GUP_REPORT_DIR"];

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "gup-output-file-"));
  process.env["GUP_REPORT_DIR"] = join(dir, "reports");
});

afterEach(() => {
  if (savedReportDir === undefined) delete process.env["GUP_REPORT_DIR"];
  else process.env["GUP_REPORT_DIR"] = savedReportDir;
  rmSync(dir, { recursive: true, force: true });
});

const NOW = new Date(2026, 9, 3, 14, 22, 5);

describe("writeOutputFile", () => {
  it("writes a dated file in the reports directory, created on demand", async () => {
    const path = await writeOutputFile({ kind: "diagnostic", extension: "zip", content: "zip", now: NOW });
    expect(path).toBe(join(dir, "reports", "gup-diagnostic-20261003-142205.zip"));
    expect(readFileSync(path, "utf8")).toBe("zip");
  });

  it("never reuses a taken name: the next one gets a suffix", async () => {
    const first = await writeOutputFile({ kind: "report", extension: "html", content: "1", now: NOW });
    const second = await writeOutputFile({ kind: "report", extension: "html", content: "2", now: NOW });
    expect(second).toBe(join(dir, "reports", "gup-report-20261003-142205-2.html"));
    expect(readFileSync(first, "utf8")).toBe("1");
  });

  it("refuses to replace an existing --out without --force, and replaces it with", async () => {
    const out = join(dir, "mine.zip");
    writeFileSync(out, "precious");
    await expect(writeOutputFile({ kind: "diagnostic", extension: "zip", content: "new", out })).rejects.toEqual(
      new OutputExistsError(out),
    );
    expect(readFileSync(out, "utf8")).toBe("precious");
    await expect(writeOutputFile({ kind: "diagnostic", extension: "zip", content: "new", out, force: true })).resolves.toBe(out);
    expect(readFileSync(out, "utf8")).toBe("new");
  });

  it("keeps the newest files of the written kind only, leaving other kinds and foreign files", async () => {
    const reports = join(dir, "reports");
    await writeOutputFile({ kind: "history", extension: "csv", content: "keep", now: NOW });
    for (let i = 0; i < RETAINED_PER_KIND + 3; i++) {
      const path = await writeOutputFile({
        kind: "diagnostic",
        extension: "zip",
        content: String(i),
        now: new Date(2026, 9, 1, 0, 0, i),
      });
      utimesSync(path, new Date(2026, 9, 1), new Date(2026, 9, 1, 0, 0, i));
    }
    writeFileSync(join(reports, "gup-diagnostic-notes.txt"), "mine");
    await writeOutputFile({ kind: "diagnostic", extension: "zip", content: "last", now: NOW });
    const names = readdirSync(reports);
    expect(names.filter((name) => name.startsWith("gup-diagnostic-2026"))).toHaveLength(RETAINED_PER_KIND);
    expect(names).toContain("gup-diagnostic-20261003-142205.zip");
    expect(names).not.toContain("gup-diagnostic-20261001-000000.zip");
    expect(names).toContain("gup-history-20261003-142205.csv");
    expect(names).toContain("gup-diagnostic-notes.txt");
  });
});

describe("writeOutputFile in English", () => {
  useLocale("en");

  it("says in English that --out names a file that exists", async () => {
    const out = join(dir, "mine.zip");
    writeFileSync(out, "precious");

    await expect(writeOutputFile({ kind: "diagnostic", extension: "zip", content: "new", out })).rejects.toThrow(
      `${out} already exists`,
    );
  });
});

describe("outputFileName", () => {
  it("is gup-<kind>-YYYYMMDD-HHmmss.<ext> in local time, with no character a file system refuses", () => {
    expect(outputFileName("history", "json", new Date(2026, 0, 2, 3, 4, 5))).toBe("gup-history-20260102-030405.json");
  });
});
