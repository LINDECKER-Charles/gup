import { describe, expect, it } from "vitest";
import { FinkProvider, parseFinkOutdated } from "../../../src/providers/os/fink.js";
import { system } from "../../support/system/fake-system.js";
import { FINK_LIST_ARGV, FINK_OUTDATED_TAB, finkMachine } from "./posix.cases.js";

/**
 * Fink: one aggregate row counting what `fink list --outdated` reports, read
 * under a wall-clock cap, and a parser strict enough that stray prose never
 * becomes a phantom package (and a pointless sudo).
 */

describe("FinkProvider", () => {
  it("scans under a one-minute wall-clock cap — the runner has none of its own", async () => {
    await system.load(finkMachine(false));
    await new FinkProvider().listOutdated();
    expect(system.trace.spawns).toEqual([
      { mode: "run", argv: FINK_LIST_ARGV, shell: false, timeout: 60_000 },
    ]);
  });

  it("leaves the row to update in place when gup already runs as root", async () => {
    await system.load(finkMachine(true));
    const [row] = await new FinkProvider().listOutdated();
    expect(row).toBeDefined();
    expect(row?.requiresAdmin).toBeUndefined();
  });
});

describe("parseFinkOutdated", () => {
  it("reads the tab-delimited shape", () => {
    expect(parseFinkOutdated(FINK_OUTDATED_TAB)).toEqual(["gettext", "libiconv"]);
  });

  it("reads the space-padded table shape", () => {
    const padded = [
      "(i) gettext                        0.22.5-1        Message localization support",
      "    xz                             5.4.4-1         Compression utility",
    ].join("\r\n");
    expect(parseFinkOutdated(padded)).toEqual(["gettext", "xz"]);
  });

  it("accepts every status glyph do_real_list can print", () => {
    const stdout = [
      "i\tbash\t5.2.15-1\tGNU shell",
      "(i)\tgettext\t0.22.5-1\tMessage localization support",
      "*i*\tperl\t5.34.1-1\tPractical Extraction and Report Language",
      "\tcurl\t8.5.0-1\tData transfer tool",
    ].join("\n");
    expect(parseFinkOutdated(stdout)).toEqual(["bash", "gettext", "perl", "curl"]);
  });

  it("accepts an epoch-prefixed dpkg version", () => {
    expect(parseFinkOutdated("(i)\tsystem-perl\t2:5.34.1-1\tPerl")).toEqual(["system-perl"]);
  });

  it("exempts a virtual package from the version column", () => {
    expect(parseFinkOutdated("p\tsystem-java\t\tVirtual package")).toEqual(["system-java"]);
  });

  it("refuses a wrapped prose line that cleared the blank status glyph", () => {
    expect(parseFinkOutdated("   the following packages will be installed")).toEqual([]);
  });

  it("refuses an unknown status glyph, a bad name and a bad version", () => {
    const stdout = [
      "Information about 12345 packages read in 1 seconds.",
      "!!!\tgettext\t0.22.5-1\tbad flag",
      "(i)\t-gettext\t0.22.5-1\tbad name",
      "(i)\tgettext\tunstable\tbad version",
    ].join("\n");
    expect(parseFinkOutdated(stdout)).toEqual([]);
  });

  it("ignores blank input, blank lines and truncated rows", () => {
    expect(parseFinkOutdated("")).toEqual([]);
    expect(parseFinkOutdated("\n\n   \n")).toEqual([]);
    expect(parseFinkOutdated("ab")).toEqual([]);
    expect(parseFinkOutdated("(i)\tgettext")).toEqual([]);
  });
});
