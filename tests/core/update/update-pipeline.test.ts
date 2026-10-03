import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { providers, runElevatedBatchMock, recordUpdateMock } = vi.hoisted(() => ({
  providers: new Map<string, unknown>(),
  runElevatedBatchMock: vi.fn(),
  recordUpdateMock: vi.fn(),
}));
vi.mock("../../../src/core/registry.js", () => ({
  getProvider: (id: string) => providers.get(id),
  ALL_PROVIDERS: [],
}));
vi.mock("../../../src/core/elevation.js", () => ({ runElevatedBatch: runElevatedBatchMock }));
vi.mock("../../../src/core/history/store.js", () => ({ recordUpdate: recordUpdateMock }));

import { PLATFORMS } from "../../../src/core/platform/platforms.js";
import type { OutdatedPackage, UpdateOutcome } from "../../../src/core/types.js";
import {
  observeUpdates,
  setBatchGuard,
  type BatchGuard,
} from "../../../src/core/update/update-extensions.js";
import {
  AUTO_DECISIONS,
  HEADLESS_DECISIONS,
  runUpdates,
} from "../../../src/core/update/update-pipeline.js";
import type {
  AbortGate,
  RetryStrategyId,
  UpdateDecisions,
  UpdateObserver,
  UpdatePorts,
  UpdateRequest,
} from "../../../src/core/update/update-ports.js";

function provider(id: string, outcomes: Record<string, Partial<UpdateOutcome>> = {}) {
  const update = vi.fn(async (packageId: string) => ({
    id: packageId,
    success: true,
    ...outcomes[packageId],
  }));
  const fake = {
    id,
    displayName: id.toUpperCase(),
    isAvailable: async () => true,
    listOutdated: async () => [],
    update,
    updateAll: async () => [],
  };
  providers.set(id, fake);
  return fake;
}

const pkg = (id: string, over: Partial<OutdatedPackage> = {}): OutdatedPackage => ({
  id,
  current: "1.0",
  latest: "2.0",
  ...over,
});

const request = (providerId: string, packageId: string, over: Partial<UpdateRequest> = {}) => ({
  providerId,
  packageId,
  pkg: pkg(packageId),
  ...over,
});

/** Observer that keeps a readable trace of what it heard. */
function recorder(): UpdateObserver & { events: string[] } {
  const events: string[] = [];
  return {
    events,
    planned: (plan) => events.push(`planned ${plan.direct.length}+${plan.elevated.length}`),
    started: ({ item, retry }) => events.push(`started ${item.key}${retry ? ` ${retry}` : ""}`),
    finished: ({ item, outcome }) => events.push(`finished ${item.key} ${status(outcome)}`),
    elevationStarted: (items) => events.push(`elevating ${items.length}`),
    cancelled: (items) => events.push(`cancelled ${items.map((i) => i.key).join(",")}`),
    waiting: (holder) => events.push(`waiting ${holder.kind}`),
  };
}

const status = (o: UpdateOutcome): string => (o.success ? "ok" : o.skipped ? "skip" : "fail");

function decisions(over: Partial<UpdateDecisions> = {}) {
  return {
    confirmElevation: vi.fn(async () => true),
    chooseRetry: vi.fn(async (): Promise<RetryStrategyId | null> => null),
    ...over,
  };
}

const open: AbortGate = { isAbortRequested: () => false };

function ports(over: Partial<UpdatePorts> = {}) {
  const observer = recorder();
  return { observer, decisions: decisions(), gate: open, ...over } as UpdatePorts & {
    observer: typeof observer;
  };
}

beforeEach(() => {
  providers.clear();
  runElevatedBatchMock.mockReset();
  recordUpdateMock.mockReset();
});

afterEach(() => {
  setBatchGuard(null);
});

describe("runUpdates: direct installs", () => {
  it("updates one package at a time, provider by provider, and reports each", async () => {
    const winget = provider("winget");
    const npm = provider("npm");
    const run = ports();
    const report = await runUpdates(
      [request("winget", "a"), request("npm", "b"), request("winget", "c")],
      run,
    );
    expect(winget.update.mock.calls.map((c) => c[0])).toEqual(["a", "c"]);
    expect(npm.update).toHaveBeenCalledWith("b");
    expect(run.observer.events).toEqual([
      "planned 3+0",
      "started winget:a",
      "finished winget:a ok",
      "started winget:c",
      "finished winget:c ok",
      "started npm:b",
      "finished npm:b ok",
    ]);
    expect(report.succeeded).toHaveLength(3);
    expect(report.entries.map((e) => e.key)).toEqual(["winget:a", "winget:c", "npm:b"]);
  });

  it("stops before the next package once the gate closes, and reports the rest cancelled", async () => {
    provider("p");
    let isClosed = false;
    const run = ports({ gate: { isAbortRequested: () => isClosed } });
    run.observer.finished = () => {
      isClosed = true;
    };
    const admin = request("p", "z", { pkg: pkg("z", { requiresAdmin: true }) });
    const report = await runUpdates([request("p", "a"), request("p", "b"), admin], run);
    expect(report.entries.map((e) => e.key)).toEqual(["p:a"]);
    expect(report.cancelled.map((i) => i.key)).toEqual(["p:b", "p:z"]);
    expect(run.observer.events.at(-1)).toBe("cancelled p:b,p:z");
    expect(run.decisions.confirmElevation).not.toHaveBeenCalled();
  });

  it("skips a package whose provider is unknown or foreign to this platform, without recording it", async () => {
    providers.set("brew", { ...provider("brew"), platforms: PLATFORMS.macos });
    const originalPlatform = process.platform;
    Object.defineProperty(process, "platform", { value: "win32", configurable: true });
    try {
      const run = ports();
      const report = await runUpdates([request("ghost", "x"), request("brew", "jq")], run);
      expect(report.skipped.map((o) => o.message)).toEqual([
        "Provider inconnu: ghost",
        "Provider brew indisponible sur Windows (macOS uniquement)",
      ]);
      expect(run.observer.events).not.toContain("started ghost:x");
      expect(recordUpdateMock).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(process, "platform", { value: originalPlatform, configurable: true });
    }
  });

  it("records each attempt with its scan entry and schedule", async () => {
    provider("p");
    const entry = pkg("a");
    await runUpdates([{ providerId: "p", packageId: "a", pkg: entry, scheduleId: "s-1" }], ports());
    expect(recordUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ providerId: "p", pkg: entry, scheduleId: "s-1" }),
    );
  });

  it("tells every provider not to prompt in a run nobody watches", async () => {
    const winget = provider("winget");
    await runUpdates([request("winget", "a")], ports({ decisions: HEADLESS_DECISIONS }));
    expect(winget.update).toHaveBeenCalledExactlyOnceWith("a", { unattended: true });
  });
});

describe("runUpdates: elevated batch", () => {
  const admin = (id: string) => request("choco", id, { pkg: pkg(id, { requiresAdmin: true }) });

  it("runs the admin packages after the direct ones, behind one confirmation", async () => {
    provider("choco");
    runElevatedBatchMock.mockResolvedValueOnce([
      { id: "nodejs", success: true },
      { id: "python", success: false, message: "boom" },
    ]);
    const run = ports();
    const report = await runUpdates([admin("nodejs"), request("choco", "fzf"), admin("python")], run);
    expect(run.decisions.confirmElevation).toHaveBeenCalledExactlyOnceWith(2);
    expect(runElevatedBatchMock).toHaveBeenCalledWith(["choco:nodejs", "choco:python"]);
    expect(run.observer.events).toEqual([
      "planned 1+2",
      "started choco:fzf",
      "finished choco:fzf ok",
      "elevating 2",
      "finished choco:nodejs ok",
      "finished choco:python fail",
    ]);
    expect(recordUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ providerId: "choco", outcome: { id: "nodejs", success: true }, elevated: true }),
    );
    expect(report.failed.map((o) => o.id)).toEqual(["python"]);
  });

  it("skips and records the admin packages when the elevation is declined", async () => {
    const run = ports({ decisions: decisions({ confirmElevation: vi.fn(async () => false) }) });
    const report = await runUpdates([admin("nodejs")], run);
    expect(runElevatedBatchMock).not.toHaveBeenCalled();
    expect(report.skipped).toEqual([
      { id: "nodejs", success: false, skipped: true, message: "Élévation refusée par l'utilisateur" },
    ]);
    const record = recordUpdateMock.mock.calls[0]![0];
    expect(record).not.toHaveProperty("elevated");
  });

  it("never elevates an unattended run, and says why", async () => {
    const report = await runUpdates([admin("nodejs")], ports({ decisions: HEADLESS_DECISIONS }));
    expect(runElevatedBatchMock).not.toHaveBeenCalled();
    expect(report.skipped[0]!.message).toBe(
      "Droits administrateur requis : non disponible sans surveillance",
    );
  });
});

describe("runUpdates: retries", () => {
  it("offers the tiers in order, drops the ones used, and replays with the chosen options", async () => {
    const winget = provider("winget", { a: { success: false, retryable: true } });
    const chooseRetry = vi
      .fn<UpdateDecisions["chooseRetry"]>()
      .mockResolvedValueOnce("force")
      .mockResolvedValueOnce(null);
    const run = ports({ decisions: decisions({ chooseRetry }) });
    await runUpdates([request("winget", "a")], run);
    expect(chooseRetry.mock.calls.map(([r]) => r.strategies)).toEqual([
      ["force", "force-uninstall", "reinstall"],
      ["force-uninstall", "reinstall"],
    ]);
    expect(chooseRetry.mock.calls[0]![0].failures.map((f) => f.key)).toEqual(["winget:a"]);
    expect(winget.update).toHaveBeenLastCalledWith("a", { force: true });
    expect(run.observer.events).toContain("started winget:a force");
    expect(recordUpdateMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ retry: "retry --force", pkg: pkg("a") }),
    );
  });

  it("keeps a run nobody watches from prompting on a replay too", async () => {
    const winget = provider("winget", { a: { success: false, retryable: true } });
    const chooseRetry = vi.fn<UpdateDecisions["chooseRetry"]>().mockResolvedValueOnce("force");
    await runUpdates(
      [request("winget", "a")],
      ports({ decisions: decisions({ chooseRetry, unattended: true }) }),
    );
    expect(winget.update).toHaveBeenLastCalledWith("a", { force: true, unattended: true });
  });

  it("keeps the new outcome when a retry succeeds and stops asking", async () => {
    const winget = provider("winget", { a: { success: false, retryable: true } });
    const chooseRetry = vi.fn(async (): Promise<RetryStrategyId | null> => {
      winget.update.mockResolvedValueOnce({ id: "a", success: true });
      return "force";
    });
    const report = await runUpdates([request("winget", "a")], ports({ decisions: decisions({ chooseRetry }) }));
    expect(chooseRetry).toHaveBeenCalledOnce();
    expect(report.succeeded.map((o) => o.id)).toEqual(["a"]);
    expect(report.failed).toEqual([]);
  });

  it("asks nothing once the batch was stopped", async () => {
    provider("winget", { a: { success: false, retryable: true } });
    let isClosed = false;
    const run = ports({ gate: { isAbortRequested: () => isClosed } });
    run.observer.finished = () => {
      isClosed = true;
    };
    await runUpdates([request("winget", "a")], run);
    expect(run.decisions.chooseRetry).not.toHaveBeenCalled();
  });

  it("AUTO_DECISIONS elevates without asking and never retries", async () => {
    provider("winget", { a: { success: false, retryable: true } });
    runElevatedBatchMock.mockResolvedValueOnce([{ id: "n", success: true }]);
    const admin = request("choco", "n", { pkg: pkg("n", { requiresAdmin: true }) });
    const report = await runUpdates([request("winget", "a"), admin], ports({ decisions: AUTO_DECISIONS }));
    expect(runElevatedBatchMock).toHaveBeenCalledOnce();
    expect(report.failed.map((o) => o.id)).toEqual(["a"]);
  });
});

describe("runUpdates: extension slots", () => {
  it("waits on the batch guard of an interactive run and releases it at the end", async () => {
    provider("p");
    const order: string[] = [];
    const guard: BatchGuard = {
      enter: async (wait) => {
        wait.onWait({ kind: "scheduled", pid: 42, startedAt: "2026-10-03T10:02:00.000Z" });
        order.push("entered");
        return () => order.push("released");
      },
    };
    setBatchGuard(guard);
    const run = ports();
    run.observer.started = () => order.push("update");
    await runUpdates([request("p", "a")], run);
    expect(order).toEqual(["entered", "update", "released"]);
    expect(run.observer.events).toContain("waiting scheduled");
  });

  it("does not enter the guard for a scheduled run, which already holds it", async () => {
    provider("p");
    const enter = vi.fn(async () => () => {});
    setBatchGuard({ enter });
    await runUpdates([request("p", "a")], ports({ batch: "scheduled" }));
    expect(enter).not.toHaveBeenCalled();
  });

  it("lets a module listen to every run; a failing listener stops nothing", async () => {
    provider("p");
    const listener = recorder();
    const broken = { ...recorder(), started: () => { throw new Error("listener bug"); } };
    const stopListening = observeUpdates(listener);
    const stopBroken = observeUpdates(broken);
    try {
      const report = await runUpdates([request("p", "a")], ports());
      expect(report.succeeded).toHaveLength(1);
      expect(listener.events).toEqual(["planned 1+0", "started p:a", "finished p:a ok"]);
    } finally {
      stopListening();
      stopBroken();
    }
    await runUpdates([request("p", "b")], ports());
    expect(listener.events).toHaveLength(3);
  });
});
