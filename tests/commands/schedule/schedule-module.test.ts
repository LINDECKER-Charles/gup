import { Command } from "commander";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createScheduleModule } from "../../../src/commands/schedule/schedule-module.js";
import type { SchedulerServices } from "../../../src/commands/schedule/scheduler-services.js";
import { ManualRunTracker } from "../../../src/core/scheduler/manual-run-tracker.js";
import { TICK_COMMAND } from "../../../src/core/scheduler/trigger/task-command.js";
import { batchGuard, setBatchGuard } from "../../../src/core/update/update-extensions.js";
import type { UpdateObserver } from "../../../src/core/update/update-ports.js";
import { SCHEDULE_CLI_LABELS } from "../../../src/ui/text/schedule/schedule-cli-labels.js";
import { useLocale } from "../../support/locale.js";
import { schedulerFixture, type Fixture } from "./scheduler-fixture.js";

let fixture: Fixture;

afterEach(async () => {
  setBatchGuard(null);
  await fixture?.cleanup();
});

/** Stands for the menu's run tracker: the module only hands it to the observer slot. */
const MENU_RUNS = new ManualRunTracker(
  () => {},
  () => new Date(),
);

async function moduleWith(services?: () => SchedulerServices | { error: string }) {
  fixture = await schedulerFixture();
  const exit = vi.fn<(code: number) => void>();
  const observe = vi.fn<(observer: UpdateObserver) => () => void>(() => () => {});
  const cliModule = createScheduleModule({
    services: services ?? (() => fixture.services),
    output: fixture.output,
    exit,
    menuRuns: () => MENU_RUNS,
    observe,
  });
  const program = new Command().name("gup").exitOverride();
  cliModule.register?.(program, { modules: [cliModule] });
  const parse = (...args: string[]) => program.parseAsync(["node", "gup", ...args]);
  return { cliModule, exit, parse, observe, program };
}

describe("scheduleModule", () => {
  it("marks the tick as started by a schedule", async () => {
    const { cliModule } = await moduleWith();
    expect(cliModule.triggerFor?.(TICK_COMMAND)).toBe("schedule");
    expect(cliModule.triggerFor?.("schedule list")).toBeUndefined();
  });

  it("makes interactive commands wait for a scheduled batch, never the tick itself", async () => {
    const { cliModule } = await moduleWith();
    const pristine = batchGuard();
    await cliModule.beforeAction?.({ commandPath: TICK_COMMAND, options: {} });
    expect(batchGuard()).toBe(pristine);
    await cliModule.beforeAction?.({ commandPath: "update", options: {} });
    expect(batchGuard()).not.toBe(pristine);
  });

  it("repairs a registration of this package that drifted before listing", async () => {
    const { cliModule } = await moduleWith();
    driftedRegistration();
    await cliModule.beforeAction?.({ commandPath: "schedule list", options: {} });
    expect(fixture.output.errors).toEqual([SCHEDULE_CLI_LABELS.triggerRepaired]);
    expect(fixture.trigger.installed?.command.node).toBe("/usr/bin/node");
  });

  it("lets the menu record a run-now whose updates leave the screen, and no other command", async () => {
    const { cliModule, observe } = await moduleWith();
    await cliModule.beforeAction?.({ commandPath: "update", options: {} });
    await cliModule.beforeAction?.({ commandPath: "schedule list", options: {} });
    expect(observe).not.toHaveBeenCalled();
    await cliModule.beforeAction?.({ commandPath: "", options: {} });
    expect(observe.mock.calls).toEqual([[MENU_RUNS]]);
  });

  it("heals in the background when the menu starts, printing nothing", async () => {
    const { cliModule } = await moduleWith();
    driftedRegistration();
    await cliModule.beforeAction?.({ commandPath: "", options: {} });
    await vi.waitFor(() => expect(fixture.trigger.installed?.command.node).toBe("/usr/bin/node"));
    expect(fixture.output.errors).toEqual([]);
  });

  function driftedRegistration(): void {
    fixture.services.repo.create(
      {
        name: "x",
        recurrence: { kind: "daily", at: { hour: 9, minute: 0 } },
        targets: [{ providerId: "winget", packageId: "Git.Git" }],
        enabled: true,
        options: { catchUp: true },
      },
      new Date(),
    );
    fixture.services.installs.write({
      v: 1,
      platform: "linux",
      mechanism: "crontab",
      launcher: "headless",
      argv: ["/old/node", "/usr/lib/node_modules/@charles_lindecker/gup/dist/cli.js", TICK_COMMAND],
      env: {},
      installedAt: "2026-10-01T08:00:00.000Z",
      gupVersion: "0.4.0",
    });
  }

  it("reports one doctor line", async () => {
    const { cliModule } = await moduleWith();
    expect(await cliModule.diagnostics?.()).toEqual([
      { label: "Planification", value: "aucune planification active", status: "off" },
    ]);
    await fixture.cleanup();
    const broken = await moduleWith(() => ({ error: "emplacement indisponible" }));
    expect(await broken.cliModule.diagnostics?.()).toEqual([
      { label: "Planification", value: "emplacement indisponible", status: "warn" },
    ]);
  });

  it("wires gup schedule add and list to their handlers and exit codes", async () => {
    const { exit, parse } = await moduleWith();
    await parse("schedule", "add", "npm-g:typescript", "--every", "daily", "--at", "07:30", "--no-catch-up");
    expect(exit).toHaveBeenLastCalledWith(0);
    expect(fixture.services.repo.list()[0]).toMatchObject({
      recurrence: { kind: "daily", at: { hour: 7, minute: 30 } },
      options: { catchUp: false },
    });
    await parse("schedule", "add", "winget", "--every", "daily");
    expect(exit).toHaveBeenLastCalledWith(2);
    await parse("schedule", "list", "--json");
    expect(exit).toHaveBeenLastCalledWith(0);
    expect(JSON.parse(fixture.output.lines.at(-1) ?? "{}")).toMatchObject({ trigger: { installed: true } });
  });

  it("explains a machine without a state dir", async () => {
    const { exit, parse } = await moduleWith(() => ({ error: "emplacement indisponible" }));
    await parse("schedule", "status");
    expect(exit).toHaveBeenLastCalledWith(1);
    expect(fixture.output.errors).toEqual(["emplacement indisponible"]);
  });
});

describe("scheduleModule in English", () => {
  useLocale("en");

  it("builds its help and its doctor line in the language startup chose", async () => {
    const { cliModule, program } = await moduleWith();
    const schedule = program.commands.find((command) => command.name() === "schedule");
    const add = schedule?.commands.find((command) => command.name() === "add");
    expect(schedule?.description()).toBe("Updates specific packages automatically, at a set time.");
    expect(add?.usage()).toBe("[options] <targets...>");
    expect(add?.helpInformation()).toContain("--on <day>");
    expect(await cliModule.diagnostics?.()).toEqual([
      { label: "Schedules", value: "no active schedule", status: "off" },
    ]);
  });
});
