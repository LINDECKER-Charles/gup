import { describe, expect, it } from "vitest";
import type { PlannedUpdate, UpdatePlan } from "../../../src/core/update/update-ports.js";
import { RunModel } from "../../../src/ui/run/run-model.js";
import { outcome, pkg } from "../../support/builders.js";

function planned(packageId: string, overrides: Partial<PlannedUpdate> = {}): PlannedUpdate {
  return {
    providerId: "winget",
    packageId,
    key: `winget:${packageId}`,
    providerName: "Winget",
    pkg: pkg(packageId),
    ...overrides,
  };
}

const GIT = planned("Git.Git", { pkg: pkg("Git.Git", { name: "Git", current: "2.51", latest: "2.52" }) });
const ZIP = planned("7zip.7zip");
const NODE = planned("nodejs", { providerId: "choco", key: "choco:nodejs", providerName: "Chocolatey" });
const PLAN: UpdatePlan = { direct: [GIT, ZIP], elevated: [NODE] };

/** A model on a clock the test moves. */
function model() {
  let now = 1_000;
  const run = new RunModel(() => now);
  return { run, advance: (ms: number) => void (now += ms) };
}

describe("RunModel", () => {
  it("lists the plan in order, admin packages last, all pending", () => {
    const { run } = model();
    run.planned(PLAN);
    expect(run.items.map((item) => [item.label, item.state, item.isAdmin])).toEqual([
      ["Git", "pending", false],
      ["7zip.7zip", "pending", false],
      ["nodejs", "pending", true],
    ]);
    expect(run.items[0]).toMatchObject({ from: "2.51", to: "2.52", providerName: "Winget" });
    expect(run.phase).toBe("running");
  });

  it("follows each attempt: running with a live duration, then its outcome", () => {
    const { run, advance } = model();
    run.planned(PLAN);
    run.started({ item: GIT });
    advance(1_500);
    expect(run.current?.key).toBe(GIT.key);
    expect(run.durationOf(run.items[0]!)).toBe(1_500);

    run.finished({ item: GIT, outcome: outcome("Git.Git"), durationMs: 14_000 });
    run.started({ item: ZIP });
    run.finished({
      item: ZIP,
      outcome: outcome("7zip.7zip", { success: false, message: "hash invalide", retryable: true }),
      durationMs: 6_000,
    });

    expect(run.items[0]).toMatchObject({ state: "succeeded", durationMs: 14_000 });
    expect(run.items[1]).toMatchObject({ state: "failed", message: "hash invalide", isRetryable: true });
    expect(run.counts()).toEqual({
      done: 2,
      total: 3,
      succeeded: 1,
      skipped: 0,
      failed: 1,
      cancelled: 0,
    });
    expect(run.remaining()).toBe(1);
  });

  it("forgets a failed attempt's message when a retry replays the package", () => {
    const { run } = model();
    run.planned(PLAN);
    run.finished({ item: ZIP, outcome: outcome("7zip.7zip", { success: false, retryable: true }) });
    run.started({ item: ZIP, retry: "force" });
    expect(run.items[1]).toMatchObject({ state: "running", retry: "force" });
    expect(run.items[1]).not.toHaveProperty("isRetryable");
    run.finished({ item: ZIP, retry: "force", outcome: outcome("7zip.7zip") });
    expect(run.items[1]).toMatchObject({ state: "succeeded", retry: "force" });
  });

  it("marks the elevated batch, then settles each package without a duration", () => {
    const { run } = model();
    run.planned(PLAN);
    run.elevationStarted([NODE]);
    expect(run.phase).toBe("elevating");
    expect(run.current?.key).toBe(NODE.key);

    run.finished({ item: NODE, outcome: outcome("nodejs", { message: "redémarrage requis" }) });
    expect(run.items[2]).toMatchObject({ state: "succeeded", message: "redémarrage requis" });
    expect(run.durationOf(run.items[2]!)).toBeNull();
    expect(run.phase).toBe("running");
  });

  it("counts skips and cancellations apart from failures", () => {
    const { run } = model();
    run.planned(PLAN);
    run.finished({ item: GIT, outcome: outcome("Git.Git", { success: false, skipped: true }) });
    run.markStopping();
    run.cancelled([ZIP, NODE]);
    expect(run.isStopping).toBe(true);
    expect(run.counts()).toMatchObject({ done: 3, skipped: 1, cancelled: 2, failed: 0 });
  });

  it("waits for another run, then goes on when the first package starts", () => {
    const { run } = model();
    run.planned(PLAN);
    const holder = { kind: "scheduled", pid: 42, startedAt: "2026-10-03T08:00:00Z" } as const;
    run.waiting(holder);
    expect(run.phase).toBe("waiting");
    expect(run.holder).toBe(holder);
    run.started({ item: GIT });
    expect(run.phase).toBe("running");
    expect(run.holder).toBeNull();
  });

  it("stops its clock once done", () => {
    const { run, advance } = model();
    advance(3_000);
    run.markDone();
    advance(60_000);
    expect(run.elapsedMs()).toBe(3_000);
    expect(run.phase).toBe("done");
  });
});
