import { describe, expect, it } from "vitest";
import * as runner from "../../../src/core/runner.js";
import {
  parsePsResourceOutdated,
  PsResourceProvider,
} from "../../../src/providers/shell/psresource.js";
import { replaceForTest } from "../../support/system/boundary-spy.js";
import { system } from "../../support/system/fake-system.js";
import { installArgvs, probeArgvs } from "../../support/system/trace.js";
import {
  probeArgv,
  psResourceMachine,
  psRow,
  SCAN_SCRIPT,
  scanArgv,
  updateResourceArgv,
} from "./psresource.cases.js";

/**
 * PSResourceGet's knowledge: the cmdlet probe (a host is not enough), the
 * scan's bounds and scope, the version rules of the JSON it prints, and the
 * per-resource update into the user scope.
 */

const provider = () => new PsResourceProvider();
const NO_HOST = "Aucun hôte PowerShell trouvé sur le PATH.";
const PROBE_TIMEOUT_MS = 20_000;
const SCAN_TIMEOUT_MS = 180_000;

/** The scan's rows for `rows`, as `ConvertTo-Json -Compress` prints several of them. */
const scanOf = (...rows: Record<string, unknown>[]) => JSON.stringify(rows);

describe("PsResourceProvider.isAvailable", () => {
  it("asks the preferred host for the cmdlet itself, within 20 s", async () => {
    await system.load(psResourceMachine({ shell: "pwsh" }));
    await expect(provider().isAvailable()).resolves.toBe(true);
    expect(system.trace.spawns).toEqual([
      expect.objectContaining({ argv: probeArgv("pwsh"), timeout: PROBE_TIMEOUT_MS }),
    ]);
  });

  it("is unavailable, running nothing, when the PATH probe blows up", async () => {
    await system.load(psResourceMachine({ shell: "pwsh" }));
    replaceForTest(runner, "commandExists", () => Promise.reject(new Error("PATH exploded")));
    await expect(provider().isAvailable()).resolves.toBe(false);
    expect(probeArgvs()).toEqual([]);
  });

  it("is unavailable on a host without PSResourceGet (PowerShell 5.1)", async () => {
    await system.load(psResourceMachine({ shell: "powershell", probe: { stdout: "no" } }));
    await expect(provider().isAvailable()).resolves.toBe(false);
  });

  it("is unavailable when the probe exits non-zero", async () => {
    await system.load(psResourceMachine({ shell: "pwsh", probe: { stdout: "yes", exitCode: 1 } }));
    await expect(provider().isAvailable()).resolves.toBe(false);
  });

  it("is unavailable when the probe is refused", async () => {
    await system.load(psResourceMachine({ shell: "pwsh" }));
    system.inject({ on: "spawn", argv: probeArgv("pwsh"), mode: "rejects" });
    await expect(provider().isAvailable()).resolves.toBe(false);
  });
});

describe("parsePsResourceOutdated", () => {
  it("accepts the bare object ConvertTo-Json emits for a single row", () => {
    expect(parsePsResourceOutdated(JSON.stringify(psRow()))).toEqual([
      {
        id: "Microsoft.PowerShell.SecretManagement",
        name: "Microsoft.PowerShell.SecretManagement",
        current: "1.1.2",
        latest: "1.2.0",
      },
    ]);
  });

  it("accepts the array shape and annotates scripts only", () => {
    const payload = scanOf(
      psRow(),
      psRow({ Name: "AutoPilot", CurrentVersion: "3.9", LatestVersion: "3.10", Type: "Script" }),
      psRow({ Name: "SomePkg", CurrentVersion: "1.0.0", LatestVersion: "1.0.1", Type: "" }),
      psRow({ Name: "Nupkged", CurrentVersion: "1.0.0", LatestVersion: "1.0.1", Type: 7 }),
    );
    expect(parsePsResourceOutdated(payload).map((row) => [row.id, row.note])).toEqual([
      ["Microsoft.PowerShell.SecretManagement", undefined],
      ["AutoPilot", "script"],
      ["SomePkg", undefined],
      ["Nupkged", undefined],
    ]);
  });

  it("returns [] for the nothing-to-do payloads", () => {
    expect(parsePsResourceOutdated("")).toEqual([]);
    expect(parsePsResourceOutdated("   \n  ")).toEqual([]);
    // ConvertTo-Json on an empty pipeline prints the literal `null`.
    expect(parsePsResourceOutdated("null")).toEqual([]);
    expect(parsePsResourceOutdated("[]")).toEqual([]);
  });

  it("returns [] on garbage rather than throwing", () => {
    expect(parsePsResourceOutdated("Find-PSResource : repository unreachable")).toEqual([]);
    expect(parsePsResourceOutdated("{ unterminated")).toEqual([]);
  });

  it("drops rows missing any of the three mandatory fields", () => {
    const payload = JSON.stringify([
      { CurrentVersion: "1.0", LatestVersion: "2.0" },
      { Name: "A", LatestVersion: "2.0" },
      { Name: "B", CurrentVersion: "1.0" },
      { Name: "", CurrentVersion: "1.0", LatestVersion: "2.0" },
      { Name: "C", CurrentVersion: "", LatestVersion: "2.0" },
      { Name: "D", CurrentVersion: "1.0", LatestVersion: "" },
      { Name: "E", CurrentVersion: 1, LatestVersion: "2.0" },
      "not-an-object",
      null,
    ]);
    expect(parsePsResourceOutdated(payload)).toEqual([]);
  });

  it.each([
    ["1.9.0", "1.10.0", true],
    ["1.10.0", "1.9.0", false],
    // A missing System.Version tail reads as zero, on either side.
    ["1.2", "1.2.0.0", false],
    ["1.2.0.0", "1.2", false],
    ["1.2.0.1", "1.2", false],
    ["1.2", "1.2.0.1", true],
    // A prerelease ranks below its own release, never the reverse.
    ["2.3.0-beta1", "2.3.0", true],
    ["2.3.0", "2.3.0-beta1", false],
    // The same string on both sides, even unparseable, is never an upgrade.
    ["1.2.0", " 1.2.0 ", false],
    ["2024.09.beta", " 2024.09.beta ", false],
    // A row it merely failed to re-parse is kept rather than hiding real work.
    ["cafe", "babe", true],
    ["1.-2", "1.3", true],
  ])("orders %j before %j: %s", (current, latest, isListed) => {
    const rows = parsePsResourceOutdated(
      JSON.stringify(psRow({ CurrentVersion: current, LatestVersion: latest })),
    );
    expect(rows).toHaveLength(isListed ? 1 : 0);
  });

  it("never flags a row as needing elevation — updates land in CurrentUser", () => {
    const rows = parsePsResourceOutdated(scanOf(psRow()));
    expect(rows).toHaveLength(1);
    expect(rows.every((row) => row.requiresAdmin === undefined)).toBe(true);
  });
});

describe("PsResourceProvider.listOutdated", () => {
  it("bounds the scan at three minutes and never asks for prereleases", async () => {
    await system.load(psResourceMachine({ shell: "pwsh" }));
    await expect(provider().listOutdated()).resolves.toEqual([]);
    expect(system.trace.spawns).toEqual([
      expect.objectContaining({ argv: scanArgv("pwsh"), timeout: SCAN_TIMEOUT_MS }),
    ]);
    // gup only ever offers the highest released version: no `-Prerelease` anywhere.
    expect(SCAN_SCRIPT).toContain("Find-PSResource");
    expect(SCAN_SCRIPT).toContain("ConvertTo-Json -Compress");
    expect(SCAN_SCRIPT).not.toContain("-Prerelease");
  });

  it("lists nothing, running nothing, without a PowerShell host", async () => {
    await system.load({ platform: "win32" });
    await expect(provider().listOutdated()).resolves.toEqual([]);
    expect(probeArgvs()).toEqual([]);
  });

  it("lists nothing when the scan is refused", async () => {
    await system.load(psResourceMachine({ shell: "pwsh" }));
    system.inject({ on: "spawn", argv: scanArgv("pwsh"), mode: "rejects" });
    await expect(provider().listOutdated()).resolves.toEqual([]);
  });

  it("drops the rows the gallery reports as not actually newer", async () => {
    const stdout = scanOf(
      psRow({ Name: "Behind", CurrentVersion: "1.9.0", LatestVersion: "1.10.0" }),
      psRow({ Name: "Level", CurrentVersion: "2.0", LatestVersion: "2.0.0.0" }),
      psRow({ Name: "Ahead", CurrentVersion: "3.1.0", LatestVersion: "3.0.9" }),
    );
    await system.load(psResourceMachine({ shell: "pwsh", scan: { stdout } }));
    await expect(provider().listOutdated()).resolves.toEqual([
      { id: "Behind", name: "Behind", current: "1.9.0", latest: "1.10.0" },
    ]);
  });
});

describe("PsResourceProvider.update", () => {
  it("fails, spawning nothing, without a PowerShell host", async () => {
    await system.load({ platform: "win32" });
    await expect(provider().update("Az.Accounts")).resolves.toEqual({
      id: "Az.Accounts",
      success: false,
      message: NO_HOST,
    });
    expect(installArgvs()).toEqual([]);
  });

  it("describes a refused spawn instead of throwing", async () => {
    await system.load(psResourceMachine({ shell: "pwsh" }));
    system.answerInstall({ rejects: true });
    await expect(provider().update("Az")).resolves.toEqual({
      id: "Az",
      success: false,
      message: expect.stringMatching(/^Échec de la mise à jour PSResourceGet : injected fault/),
    });
  });

  it("describes a rejection that is not an Error as text", async () => {
    await system.load(psResourceMachine({ shell: "pwsh" }));
    // The runner rejects with Errors only; the provider still guards against anything else.
    replaceForTest(runner, "runInherit", () => Promise.reject("boom"));
    await expect(provider().update("Az")).resolves.toMatchObject({
      message: "Échec de la mise à jour PSResourceGet : boom",
    });
  });
});

describe("PsResourceProvider.updateAll", () => {
  it("fails only the rows left when the host disappears mid-run", async () => {
    await system.load(psResourceMachine({ shell: "pwsh" }));
    let probes = 0;
    replaceForTest(runner, "commandExists", (name: string) => {
      probes += 1;
      return Promise.resolve(probes === 1 && name === "pwsh");
    });
    const rows = ["A", "B"].map((id) => ({ id, current: "1", latest: "2" }));
    await expect(provider().updateAll(rows)).resolves.toEqual([
      { id: "A", success: true },
      { id: "B", success: false, message: NO_HOST },
    ]);
    expect(installArgvs()).toEqual([updateResourceArgv("pwsh", "A")]);
  });
});
