import { describe, expect, it } from "vitest";
import type { ProviderContractCase } from "../contract/types.js";
import {
  fixtureTargets,
  fixtureText,
  type LabelledCase,
  type ManifestEntry,
  parseRecordArgs,
  selectTargets,
  withManifestEntry,
} from "../fixtures/recording.js";
import { fixture } from "../fixtures/refs.js";
import type { SystemSpec } from "../system/types.js";

/** The fixture recorder's rules: what it records, what a run selects, what it writes. */

const UPGRADE = fixture("providers/os/winget/upgrade.win32.txt");
const PINS = fixture("providers/os/winget/pin-list.win32.txt");

function labelled(system: SystemSpec, providerId = "winget", domain = "os"): LabelledCase {
  const contractCase = { system, create: () => ({}), outdated: [], updateAll: "per-package" };
  return { domain, providerId, contractCase: contractCase as unknown as ProviderContractCase };
}

const WINDOWS: SystemSpec = {
  platform: "win32",
  commands: [
    { argv: ["winget", "upgrade"], stdout: UPGRADE },
    {
      argv: ["winget", "pin", "list"],
      stdout: PINS,
      stderr: fixture("providers/os/winget/pin-list.err.win32.txt"),
    },
    { argv: ["winget", "--version"], stdout: "v1.11.430" },
  ],
};

describe("fixtureTargets", () => {
  it("takes the probes whose output is a fixture, on the host's platform only", () => {
    const linux = labelled({ platform: "linux", commands: [{ argv: ["brew"], stdout: UPGRADE }] });
    const targets = fixtureTargets([labelled(WINDOWS), linux], "win32");
    expect(targets.map((target) => target.argv)).toEqual([
      ["winget", "upgrade"],
      ["winget", "pin", "list"],
    ]);
    expect(targets[1]?.stderr?.path).toBe("providers/os/winget/pin-list.err.win32.txt");
  });

  it("records a fixture once, however many cases share it", () => {
    const targets = fixtureTargets([labelled(WINDOWS), labelled(WINDOWS)], "win32");
    expect(targets).toHaveLength(2);
  });

  it("never looks at an install: only the machine's probes", () => {
    const contractCase = labelled(WINDOWS);
    const withInstalls = {
      ...contractCase,
      contractCase: {
        ...contractCase.contractCase,
        update: { packageId: "x", installs: [["winget", "upgrade", "--id", "x"]] },
      },
    };
    const argvs = fixtureTargets([withInstalls], "win32").map((target) => target.argv);
    expect(argvs).not.toContainEqual(["winget", "upgrade", "--id", "x"]);
  });
});

describe("parseRecordArgs and selectTargets", () => {
  const pip = { platform: "win32", commands: [{ argv: ["pip"], stdout: fixture("p.txt") }] } as const;
  const targets = fixtureTargets([labelled(WINDOWS), labelled(pip, "pip", "python")], "win32");

  it("reads value lists up to the next flag", () => {
    const args = ["--provider", "winget", "pip", "--domain", "wsl", "--dry-run"];
    expect(parseRecordArgs(args)).toEqual({
      providers: ["winget", "pip"],
      domains: ["wsl"],
      isAll: false,
      isDryRun: true,
    });
  });

  it("selects by provider or by domain, or everything with --all", () => {
    const ids = (args: string[]) =>
      selectTargets(targets, parseRecordArgs(args)).map((target) => target.providerId);
    expect(ids(["--provider", "pip"])).toEqual(["pip"]);
    expect(ids(["--domain", "os"])).toEqual(["winget", "winget"]);
    expect(ids(["--all"])).toEqual(["winget", "winget", "pip"]);
  });

  it.each([[[]], [["--all", "--provider", "pip"]], [["pip"]], [["--force"]]])(
    "refuses %j",
    (args) => {
      expect(() => parseRecordArgs(args)).toThrow(/usage|unexpected argument/);
    },
  );
});

describe("manifest and file text", () => {
  const entry = (file: string, gup: string): ManifestEntry => ({
    file,
    argv: ["winget", "upgrade"],
    platform: "win32",
    os: "Windows 11 Pro 10.0.26200",
    recordedAt: "2026-10-03",
    gup,
    redactions: { "<USER>": 1 },
  });

  it("replaces the entry of a re-recorded file, its neutralisation note dropped, sorted", () => {
    const neutralised = { ...entry("upgrade.win32.txt", "a"), neutralised: "names" };
    const first = withManifestEntry(null, neutralised);
    const second = withManifestEntry(first, entry("pin-list.win32.txt", "a"));
    const third = withManifestEntry(second, entry("upgrade.win32.txt", "b"));
    const expected = [entry("pin-list.win32.txt", "a"), entry("upgrade.win32.txt", "b")];
    expect(third.fixtures).toEqual(expected);
  });

  it("keeps what gup received, plus the final newline the fake runner strips again", () => {
    expect(fixtureText("a\r\nb")).toBe("a\r\nb\n");
    expect(fixtureText("")).toBe("\n");
  });
});
