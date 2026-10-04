import { describe, expect, it } from "vitest";
import {
  NugetProvider,
  parseNugetVersion,
  pickLatestStable,
  toVersionTriple,
} from "../../../src/providers/dotnet-php/nuget.js";
import { system } from "../../support/system/fake-system.js";
import type { SystemSpec } from "../../support/system/types.js";
import { probeArgvs } from "../../support/system/trace.js";
import {
  NUGET_FLAT_CONTAINER,
  NUGET_FORCED_HELP_ARGV,
  NUGET_HELP_STDOUT,
  NUGET_WINDOWS_FAILURE,
  nugetMachine,
} from "./dotnet-php.cases.js";

/**
 * The standalone NuGet CLI: its version from the `help` banner (pinned to
 * English when the binary allows it), compared as a triple against the
 * nuget.org flat container — the very package `update -self` pulls.
 */

const PLAIN_HELP_ARGV = ["nuget", "help"];

/** nuget.exe answering the forced banner, then the plain one. */
function helpMachine(forced: object, plain: object, versions = ["6.12.0"]): SystemSpec {
  return {
    ...nugetMachine("win32", versions),
    commands: [
      { argv: NUGET_FORCED_HELP_ARGV, ...forced },
      { argv: PLAIN_HELP_ARGV, ...plain },
    ],
  };
}

describe("parseNugetVersion", () => {
  it("reads the four-part file version from the English banner", () => {
    expect(parseNugetVersion(NUGET_HELP_STDOUT)).toBe("6.11.0.0");
    expect(parseNugetVersion("NuGet Version: 7.6.0.7")).toBe("7.6.0.7");
  });

  it("tolerates the localized spacing around the colon and a v prefix", () => {
    expect(parseNugetVersion("NuGet Version : 6.11.0.0")).toBe("6.11.0.0");
    expect(parseNugetVersion("NuGet Version: v7.6.0")).toBe("7.6.0");
  });

  it("finds the banner behind a Mono warning line", () => {
    const stdout = [
      "WARNING: The runtime version supported by this application is unavailable.",
      "NuGet Version: 5.11.0.0",
    ].join("\n");
    expect(parseNugetVersion(stdout)).toBe("5.11.0.0");
  });

  it("falls back to the first line when the wording itself is translated", () => {
    expect(parseNugetVersion("NuGet バージョン: 6.11.0.0\nusage: …")).toBe("6.11.0.0");
    expect(parseNugetVersion("\n\n  NuGet, версия: 5.9.1  \n")).toBe("5.9.1");
  });

  it("refuses a first line that is not the assembly banner", () => {
    // The help text documents a `-Version` option; it must stay out of reach.
    expect(parseNugetVersion("Mono JIT compiler version 6.12.0.200\n-Version 1.0.0")).toBeNull();
    expect(parseNugetVersion("usage: nuget <command>")).toBeNull();
  });

  it("returns null on blank input and on a banner carrying no number", () => {
    expect(parseNugetVersion("")).toBeNull();
    expect(parseNugetVersion("\r\n \r\n")).toBeNull();
    expect(parseNugetVersion("NuGet")).toBeNull();
  });
});

describe("toVersionTriple", () => {
  it("normalises a four-part file version against a three-part tag", () => {
    expect(toVersionTriple("7.6.0.7")).toBe("7.6.0");
    expect(toVersionTriple("7.6.0")).toBe("7.6.0");
  });

  it("pads rather than truncates, so 7.6 equals 7.6.0", () => {
    expect(toVersionTriple("7.6")).toBe("7.6.0");
    expect(toVersionTriple("7")).toBe("7.0.0");
  });

  it("strips a leading v and surrounding whitespace", () => {
    expect(toVersionTriple("  v6.11.0.0 ")).toBe("6.11.0");
  });

  it("degrades a non-numeric segment to zero instead of NaN", () => {
    expect(toVersionTriple("abc")).toBe("0.0.0");
    expect(toVersionTriple("6.x.1")).toBe("6.0.1");
    expect(toVersionTriple("")).toBe("0.0.0");
  });
});

describe("pickLatestStable", () => {
  it("picks the numeric maximum, so 6.10.0 beats 6.9.0", () => {
    expect(pickLatestStable(["6.9.0", "6.10.0", "6.4.0"])).toBe("6.10.0");
  });

  it("skips every prerelease shape the feed carries", () => {
    expect(pickLatestStable(["3.4.4-rtm-final", "6.11.0", "7.0.0-preview.1"])).toBe("6.11.0");
  });

  it("returns null when nothing stable is listed", () => {
    expect(pickLatestStable([])).toBeNull();
    expect(pickLatestStable(["1.0.0-rc.1", "2.0.0-beta"])).toBeNull();
  });
});

describe("NugetProvider.listOutdated", () => {
  it("retries without -ForceEnglishOutput when the option is rejected", async () => {
    await system.load(
      helpMachine(
        { stdout: "unknown option: -ForceEnglishOutput", exitCode: 1 },
        { stdout: "NuGet Version: 3.4.4.1321" },
      ),
    );
    const [row] = await new NugetProvider().listOutdated();
    expect(probeArgvs()).toEqual([NUGET_FORCED_HELP_ARGV, PLAIN_HELP_ARGV]);
    expect(row?.current).toBe("3.4.4.1321");
  });

  it("retries when the forced run succeeds but prints nothing parseable", async () => {
    await system.load(
      helpMachine({ stdout: "usage: nuget <command>" }, { stdout: "NuGet Version: 6.11.0.0" }),
    );
    const [row] = await new NugetProvider().listOutdated();
    expect(row?.latest).toBe("6.12.0");
  });

  it("returns [] on every malformed payload shape", async () => {
    for (const payload of [
      null,
      "<html>captive portal</html>",
      { error: "nope" },
      { versions: "6.11.0" },
      { versions: [] },
      { versions: [1, 2, 3] },
    ]) {
      await system.load({
        ...nugetMachine("win32"),
        http: [{ url: NUGET_FLAT_CONTAINER, json: payload }],
      });
      await expect(new NugetProvider().listOutdated()).resolves.toEqual([]);
    }
  });

  it("returns [] when the four-part install matches the three-part tag", async () => {
    await system.load(nugetMachine("win32", ["6.11.0"]));
    await expect(new NugetProvider().listOutdated()).resolves.toEqual([]);
  });

  it("returns [] when the install is ahead of the feed", async () => {
    await system.load(nugetMachine("win32", ["6.10.0"]));
    await expect(new NugetProvider().listOutdated()).resolves.toEqual([]);
  });
});

describe("NugetProvider.update", () => {
  it("fails on Windows with the write-permission cause — no skip", async () => {
    await system.load(nugetMachine("win32"));
    system.answerInstall({ exitCode: 1 });
    await expect(new NugetProvider().update("nuget")).resolves.toEqual({
      id: "nuget",
      success: false,
      message: NUGET_WINDOWS_FAILURE,
    });
  });
});
