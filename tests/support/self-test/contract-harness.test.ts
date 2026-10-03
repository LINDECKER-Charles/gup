import { describe, expect, it } from "vitest";
import {
  followsUpdateAllShape,
  installsDocumentedArgv,
  listsExpectedRows,
  needsEveryWaiver,
  reportsFailedInstall,
  routesEveryUpdate,
  staysHidden,
  survivesScanFaults,
} from "../contract/checks.js";
import { defineProviderContract } from "../contract/define-contract.js";
import {
  deriveScanFaults,
  formatSweepReport,
  sweepInstalls,
  sweepScan,
} from "../contract/fault-sweep.js";
import { installedVia } from "../contract/installers.js";
import type { ProviderContractCase, UpdateRoute } from "../contract/types.js";
import { system } from "../system/fake-system.js";
import { SELF_TEST_CASES } from "./contract-cases.js";
import {
  FallbackListProvider,
  FragileProvider,
  ListManagerProvider,
  ReleaseToolProvider,
} from "./fake-providers.js";

function selfTestCase(index: number): ProviderContractCase {
  const contractCase = SELF_TEST_CASES[index];
  if (!contractCase) throw new Error(`no self-test case ${index}`);
  return contractCase;
}

const RTOOL_ON_WINDOWS = selfTestCase(0);
const LIST_MANAGER = selfTestCase(2);

const FRAGILE: ProviderContractCase = {
  create: () => new FragileProvider(),
  system: {
    platform: "linux",
    bin: { fragile: "/usr/bin/fragile" },
    commands: [
      {
        argv: ["fragile", "outdated"],
        stdout: JSON.stringify([{ name: "a", current: "1", latest: "2" }]),
      },
    ],
  },
  outdated: [{ id: "a", current: "1", latest: "2" }],
  update: { packageId: "a", installs: [["fragile", "upgrade", "a"]] },
  updateAll: "per-package",
};

describe("fault sweep", () => {
  it("derives every fault the nominal trace makes reachable, rejections excluded", () => {
    const faults = deriveScanFaults({
      spawns: [
        { mode: "run", argv: ["t", "-v"], shell: false },
        { mode: "run", argv: ["t", "-v"], shell: false },
        { mode: "inherit", argv: ["t", "upgrade"], shell: false },
      ],
      requests: [{ method: "GET", url: "https://x.test/latest" }],
      fsReads: ["/etc/t.conf"],
    });

    expect(faults).toEqual([
      { on: "spawn", argv: ["t", "-v"], mode: "exit-1" },
      { on: "spawn", argv: ["t", "-v"], mode: "empty" },
      { on: "spawn", argv: ["t", "-v"], mode: "garbage" },
      { on: "spawn", argv: ["t", "-v"], mode: "timeout" },
      { on: "http", url: "https://x.test/latest", mode: "status-500" },
      { on: "http", url: "https://x.test/latest", mode: "rate-limited" },
      { on: "http", url: "https://x.test/latest", mode: "network" },
      { on: "http", url: "https://x.test/latest", mode: "abort" },
      { on: "http", url: "https://x.test/latest", mode: "bad-json" },
      { on: "fs", path: "/etc/t.conf", mode: "missing" },
      { on: "fs", path: "/etc/t.conf", mode: "eacces" },
    ]);
  });

  it("finds nothing on a fail-soft provider", async () => {
    await expect(sweepScan(RTOOL_ON_WINDOWS)).resolves.toEqual([]);
    await expect(sweepInstalls(RTOOL_ON_WINDOWS)).resolves.toEqual([]);
  });

  it("answers the probes only a fault reaches as failures, not as violations", async () => {
    // The legacy listing is never scripted: the nominal scan does not reach it.
    const fallback = { ...LIST_MANAGER, create: () => new FallbackListProvider() };

    await expect(sweepScan(fallback)).resolves.toEqual([]);
    expect(system.unscripted).toEqual([]);
  });

  it("names each fault that made the scan throw", async () => {
    const findings = await sweepScan(FRAGILE);

    expect(findings.map((finding) => finding.fault)).toEqual([
      { on: "spawn", argv: ["fragile", "outdated"], mode: "exit-1" },
      { on: "spawn", argv: ["fragile", "outdated"], mode: "empty" },
      { on: "spawn", argv: ["fragile", "outdated"], mode: "garbage" },
      { on: "spawn", argv: ["fragile", "outdated"], mode: "timeout" },
    ]);
    expect(findings[0]?.observed).toMatch(/^threw SyntaxError: /);
    expect(system.unscripted).toEqual([]);
  });

  it("flags an update that reports success over a failed install", async () => {
    const findings = await sweepInstalls(FRAGILE);
    const install = ["fragile", "upgrade", "a"];

    expect(findings).toEqual([
      { fault: { on: "spawn", argv: install, mode: "exit-1" }, observed: "reported success" },
      { fault: { on: "spawn", argv: install, mode: "timeout" }, observed: "reported success" },
    ]);
  });

  it("reports the findings as a table with a way to replay the first", () => {
    const garbage = { on: "spawn", argv: ["fragile", "outdated"], mode: "garbage" } as const;
    const badJson = { on: "http", url: "https://x.test/l", mode: "bad-json" } as const;

    const report = formatSweepReport("fragile", [
      { fault: garbage, observed: "threw SyntaxError: x" },
      { fault: badJson, observed: "row-shape: row 0" },
    ]);

    expect(report).toBe(
      [
        '2 injected fault(s) broke the fail-soft contract of "fragile"',
        "",
        "  fault                                    observed",
        '  spawn  ["fragile","outdated"] → garbage  threw SyntaxError: x',
        "  http   https://x.test/l → bad-json       row-shape: row 0",
        "",
        `  reproduce:  await system.load(case.system); system.inject(${JSON.stringify(garbage)})`,
      ].join("\n"),
    );
  });
});

describe("generated checks fail on a broken case", () => {
  it("rows that differ from the expected ones", async () => {
    const outdated = [{ id: "left-pad", current: "1.0.0", latest: "9.9.9" }];
    const wrong = { ...LIST_MANAGER, outdated };

    await expect(listsExpectedRows(wrong)).rejects.toThrow();
  });

  it("a provider that claims to be installed on a clean machine", async () => {
    const always: ProviderContractCase = {
      ...LIST_MANAGER,
      create: () => Object.assign(new ListManagerProvider(), { isAvailable: async () => true }),
    };

    await expect(staysHidden(always)).rejects.toThrow();
  });

  it("an install argv other than the documented one", async () => {
    const expectation = { packageId: "left-pad", installs: [["lm", "install", "left-pad"]] };

    await expect(installsDocumentedArgv(LIST_MANAGER, expectation)).rejects.toThrow();
  });

  it("a scan that is not fail-soft, with the sweep report as the message", async () => {
    await expect(survivesScanFaults(FRAGILE)).rejects.toThrow(
      '4 injected fault(s) broke the fail-soft contract of "fragile"',
    );
  });

  it("a failed install reported as a success", async () => {
    const expectation = FRAGILE.update ?? { packageId: "", installs: [] };

    await expect(reportsFailedInstall(FRAGILE, expectation)).rejects.toThrow();
  });

  it("an updateAll that does not follow the declared shape", async () => {
    const declaredOneBatch: ProviderContractCase = { ...LIST_MANAGER, updateAll: "one-batch" };

    await expect(followsUpdateAllShape(declaredOneBatch)).rejects.toThrow(
      "updateAll-shape: one-batch: 2 install(s), expected 1",
    );
  });

  it("an update routed to an installer with the wrong id", async () => {
    const route: UpdateRoute = {
      via: "brew",
      system: installedVia("brew", "rtool"),
      installs: [["brew", "upgrade", "--formula", "rtool-cli"]],
    };
    const misrouted = { ...RTOOL_ON_WINDOWS, routes: [route] };
    const expectation = RTOOL_ON_WINDOWS.update ?? { packageId: "", installs: [] };

    await expect(routesEveryUpdate(misrouted, expectation)).rejects.toThrow(
      'via brew: installs [["brew","upgrade","--formula","rtool"]] ≠ ' +
        '[["brew","upgrade","--formula","rtool-cli"]]',
    );
  });

  it("a routed outcome that differs from the declared one", async () => {
    const route: UpdateRoute = {
      via: "manual",
      system: installedVia("manual", "rtool"),
      installs: [],
      outcome: { success: false, skipped: true, message: "Mettre à jour à la main" },
    };
    const expectation = RTOOL_ON_WINDOWS.update ?? { packageId: "", installs: [] };

    await expect(
      routesEveryUpdate({ ...RTOOL_ON_WINDOWS, routes: [route] }, expectation),
    ).rejects.toThrow('via manual: message: "Télécharger rtool" ≠ "Mettre à jour à la main"');
  });

  it("a waiver nothing needs", async () => {
    const overWaived: ProviderContractCase = {
      ...LIST_MANAGER,
      waivers: [{ invariant: "update-no-shell", reason: "copied from another case" }],
    };

    await expect(needsEveryWaiver(overWaived)).rejects.toThrow(
      "update-no-shell (copied from another case) is never needed",
    );
  });
});

describe("waivers needed by a route", () => {
  /** Reports another package id when it upgrades through Homebrew. */
  class RenamingProvider extends ReleaseToolProvider {
    override async update(packageId: string) {
      const outcome = await super.update(packageId);
      return process.platform === "darwin" ? { ...outcome, id: "rtool-renamed" } : outcome;
    }
  }

  const renamed: ProviderContractCase = {
    ...RTOOL_ON_WINDOWS,
    create: () => new RenamingProvider(),
    routes: [
      {
        via: "brew",
        system: installedVia("brew", "rtool"),
        installs: [["brew", "upgrade", "--formula", "rtool"]],
        outcome: { id: "rtool-renamed" },
      },
    ],
    waivers: [{ invariant: "outcome-id", reason: "self-test: the brew route renames" }],
  };

  it("count as needed", async () => {
    await expect(needsEveryWaiver(renamed)).resolves.toBeUndefined();
  });

  it("are dead once the route is gone", async () => {
    await expect(needsEveryWaiver({ ...renamed, routes: [] })).rejects.toThrow(
      "outcome-id (self-test: the brew route renames) is never needed",
    );
  });
});

describe("contract suite validation", () => {
  it("refuses two cases with the same label", () => {
    expect(() =>
      defineProviderContract({ domain: "dup", cases: [LIST_MANAGER, LIST_MANAGER] }),
    ).toThrow('dup: two cases are labelled "lm"');
  });

  it("refuses routes on a case that declares no update", () => {
    const { update: _update, ...withoutUpdate } = RTOOL_ON_WINDOWS;
    const routed: ProviderContractCase = { ...withoutUpdate, routes: [] };

    expect(() => defineProviderContract({ domain: "routed", cases: [routed] })).toThrow(
      'routed: "rtool · scoop on windows" declares routes but no update',
    );
  });

  it("refuses a waiver without a reason", () => {
    const silent: ProviderContractCase = {
      ...LIST_MANAGER,
      waivers: [{ invariant: "slow-flag", reason: " " }],
    };

    expect(() => defineProviderContract({ domain: "silent", cases: [silent] })).toThrow(
      'silent: the waiver of "slow-flag" has no reason',
    );
  });
});
