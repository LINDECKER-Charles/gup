import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SchedulesController } from "../../../src/commands/schedule/schedules-controller.js";
import type { SchedulerServices } from "../../../src/commands/schedule/scheduler-services.js";
import { ScheduleRepo } from "../../../src/core/scheduler/persistence/schedule-repo.js";
import type { ScheduleDraft } from "../../../src/core/scheduler/model/types.js";
import type { PlannedUpdate } from "../../../src/core/update/update-ports.js";
import { buildReport } from "../../../src/core/update/update-report.js";
import { SCHEDULE_NOTICES } from "../../../src/ui/text/schedule-menu-labels.js";
import { outcome, pkg, scan } from "../../support/builders.js";
import { NOW, schedulerFixture, type Fixture, type FixtureOptions } from "./scheduler-fixture.js";

let fixture: Fixture | undefined;
let scratch: string | undefined;

afterEach(async () => {
  await fixture?.cleanup();
  if (scratch) await rm(scratch, { recursive: true, force: true });
  fixture = undefined;
  scratch = undefined;
});

const draft: ScheduleDraft = {
  name: "Outils dev",
  recurrence: { kind: "daily", at: { hour: 9, minute: 0 } },
  targets: [{ providerId: "winget", packageId: "Git.Git" }],
  enabled: true,
  options: { catchUp: true },
};

async function controllerWith(options: FixtureOptions = {}) {
  fixture = await schedulerFixture(options);
  const { services } = fixture;
  return { controller: new SchedulesController(() => services), fixture };
}

/** A pipeline attempt of `key` on behalf of `scheduleId`. */
function attempt(key: string, scheduleId: string): PlannedUpdate {
  const [providerId = "", packageId = ""] = key.split(":");
  return { providerId, packageId, key, providerName: providerId, scheduleId };
}

describe("SchedulesController reads", () => {
  it("serves one snapshot until reloaded, then what another process wrote", async () => {
    const { controller, fixture } = await controllerWith();
    const first = controller.snapshot();
    expect(controller.snapshot()).toBe(first);
    ScheduleRepo.open(fixture.services.files.schedules).create(draft, NOW);
    expect(controller.snapshot().schedules).toEqual([]);
    controller.reload();
    expect(controller.snapshot().schedules.map((schedule) => schedule.name)).toEqual(["Outils dev"]);
  });

  it("names providers from the registry, and an unknown one by its id", async () => {
    const { controller } = await controllerWith();
    expect(controller.providerName("winget")).toBe("Winget");
    expect(controller.providerName("nope")).toBe("nope");
  });

  it("validates an edit without counting the schedule it replaces", async () => {
    const { controller } = await controllerWith();
    const outcome = await controller.create(draft);
    expect(controller.validate(draft)).toEqual([]);
    if (!outcome.isSaved) throw new Error("not saved");
    expect(controller.validate({ ...draft, name: "" }, outcome.schedule.id)).toEqual([
      { field: "name", message: "nom requis" },
    ]);
  });

  it("reports the trigger like gup schedule list", async () => {
    const { controller } = await controllerWith();
    expect(await controller.trigger()).toEqual({ health: { kind: "none" }, mechanism: "crontab" });
    await controller.create(draft);
    expect(await controller.trigger()).toMatchObject({ health: { kind: "active" } });
  });
});

describe("SchedulesController changes", () => {
  it("asks for consent until the trigger has been registered once", async () => {
    const { controller, fixture } = await controllerWith();
    expect(controller.needsConsent()).toBe(true);
    expect(controller.mechanism()).toBe("crontab");
    const created = await controller.create(draft);
    expect(created).toMatchObject({ isSaved: true, sync: { kind: "installed" } });
    expect(fixture.trigger.calls).toEqual(["install"]);
    expect(controller.needsConsent()).toBe(false);
  });

  it("saves, then brings the trigger in line: removed with the last enabled schedule", async () => {
    const { controller } = await controllerWith();
    const created = await controller.create(draft);
    if (!created.isSaved) throw new Error("not saved");
    const { id } = created.schedule;
    expect(await controller.disable(id)).toMatchObject({
      isSaved: true,
      schedule: { enabled: false },
      sync: { kind: "removed" },
    });
    expect(await controller.enable(id)).toMatchObject({ schedule: { enabled: true } });
    const renamed = await controller.replace(id, { ...draft, name: "Navigateurs" });
    expect(renamed).toMatchObject({ isSaved: true, schedule: { name: "Navigateurs" } });
    expect(await controller.remove(id)).toMatchObject({ schedule: { name: "Navigateurs" } });
    expect(controller.snapshot().schedules).toEqual([]);
  });

  it("says so when the schedule was removed elsewhere meanwhile", async () => {
    const { controller } = await controllerWith();
    const missing = { isSaved: false, error: SCHEDULE_NOTICES.vanished };
    expect(await controller.replace("deadbeef", draft)).toEqual(missing);
    expect(await controller.enable("deadbeef")).toEqual(missing);
  });

  it("saves nothing, and says why, when the schedules file cannot be written", async () => {
    const { fixture } = await controllerWith();
    scratch = await mkdtemp(join(tmpdir(), "gup-schedules-ro-"));
    const notADir = join(scratch, "file");
    await writeFile(notADir, "");
    const services: SchedulerServices = {
      ...fixture.services,
      repo: ScheduleRepo.open(join(notADir, "schedules.json")),
    };
    const controller = new SchedulesController(() => services);
    expect(await controller.create(draft)).toMatchObject({ isSaved: false });
    expect(fixture.trigger.calls).toEqual([]);
  });

  it("repairs the trigger for this gup", async () => {
    const { controller, fixture } = await controllerWith();
    expect(await controller.repair()).toEqual({ kind: "installed" });
    expect(fixture.trigger.calls).toEqual(["install"]);
  });

  it("marks runs seen only when one is unseen", async () => {
    const { controller, fixture } = await controllerWith();
    const created = await controller.create(draft);
    if (!created.isSaved) throw new Error("not saved");
    controller.markSeen();
    expect(controller.snapshot().seenUntil).toBeNull();
    fixture.services.state.update(() => ({
      v: 1,
      schedules: {
        [created.schedule.id]: {
          lastRun: {
            kind: "on-time",
            status: "success",
            startedAt: NOW.toISOString(),
            finishedAt: NOW.toISOString(),
            targets: [],
          },
        },
      },
    }));
    controller.reload();
    fixture.clock.now = new Date(NOW.getTime() + 60_000);
    controller.markSeen();
    expect(controller.snapshot().seenUntil).toEqual(fixture.clock.now);
  });
});

describe("SchedulesController run now", () => {
  const outdated = { results: [scan("winget", [pkg("Git.Git")])], available: new Set(["winget"]) };

  it("plans through the targeted scan and records what the launcher reported", async () => {
    const { controller, fixture } = await controllerWith({ scan: outdated });
    const created = await controller.create(draft);
    if (!created.isSaved) throw new Error("not saved");
    const prepared = await controller.prepareRun(created.schedule.id);
    if ("error" in prepared) throw new Error(prepared.error);
    expect(fixture.scanned).toEqual([["winget"]]);
    expect(prepared.plan.updates.map((update) => update.pkg.id)).toEqual(["Git.Git"]);
    const report = buildReport(
      [{ key: "winget:Git.Git", providerId: "winget", outcome: outcome("Git.Git") }],
      [],
    );
    expect(controller.recordRun(prepared, report)).toMatchObject({ kind: "manual", status: "success" });
    expect(controller.snapshot().state.schedules[created.schedule.id]?.lastRun?.status).toBe(
      "success",
    );
  });

  it("records an update that ran outside the screen from the pipeline's attempts", async () => {
    const { controller } = await controllerWith({ scan: outdated });
    const created = await controller.create(draft);
    if (!created.isSaved) throw new Error("not saved");
    const { id } = created.schedule;
    const prepared = await controller.prepareRun(id);
    if ("error" in prepared) throw new Error(prepared.error);
    const failed = outcome("Git.Git", { success: false, message: "1603" });
    controller.runTracker.finished({ item: attempt("winget:Git.Git", id), outcome: failed });
    expect(controller.snapshot().state.schedules[id]?.lastRun).toMatchObject({
      kind: "manual",
      status: "failed",
      targets: [{ target: "winget:Git.Git", status: "failed", message: "1603" }],
    });
  });

  it("stops listening once the launcher's report is recorded", async () => {
    const { controller } = await controllerWith({ scan: outdated });
    const created = await controller.create(draft);
    if (!created.isSaved) throw new Error("not saved");
    const { id } = created.schedule;
    const prepared = await controller.prepareRun(id);
    if ("error" in prepared) throw new Error(prepared.error);
    controller.recordRun(prepared, buildReport([], []));
    const before = controller.snapshot().state.schedules[id]?.lastRun;
    controller.runTracker.finished({ item: attempt("winget:Git.Git", id), outcome: outcome("Git.Git") });
    controller.reload();
    expect(controller.snapshot().state.schedules[id]?.lastRun).toEqual(before);
  });

  it("explains a schedule that no longer exists", async () => {
    const { controller } = await controllerWith();
    expect(await controller.prepareRun("deadbeef")).toEqual({ error: SCHEDULE_NOTICES.vanished });
  });
});

describe("SchedulesController without a state directory", () => {
  it("shows nothing and refuses every change with the reason", async () => {
    const controller = new SchedulesController(() => ({ error: "pas d'emplacement" }));
    expect(controller.snapshot().schedules).toEqual([]);
    expect(controller.needsConsent()).toBe(false);
    expect(controller.mechanism()).toBeNull();
    expect(await controller.create(draft)).toEqual({ isSaved: false, error: "pas d'emplacement" });
    expect(await controller.repair()).toEqual({ kind: "failed", reason: "pas d'emplacement" });
    expect(await controller.prepareRun("a1b2c3d4")).toEqual({ error: "pas d'emplacement" });
    expect(controller.validate(draft)).toEqual([{ field: "schedules", message: "pas d'emplacement" }]);
  });
});
