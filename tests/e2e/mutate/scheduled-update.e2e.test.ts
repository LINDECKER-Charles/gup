import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { uptime } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { UpdateEvent } from "../../../src/core/history/types.js";
import { run } from "../../../src/core/runner.js";
import type { Schedule } from "../../../src/core/scheduler/model/types.js";
import { ScheduleRepo } from "../../../src/core/scheduler/persistence/schedule-repo.js";
import { schedulerFiles } from "../../../src/core/scheduler/persistence/scheduler-files.js";
import { BOOT_GRACE_SECONDS } from "../../../src/core/scheduler/scheduler-timing.js";
import {
  TICK_COMMAND,
  type TaskCommand,
} from "../../../src/core/scheduler/trigger/task-command.js";
import { systemRootOf } from "../../../src/core/scheduler/trigger/trigger-factory.js";
import { WindowsTaskTrigger } from "../../../src/core/scheduler/trigger/windows-task.js";
import { CLI_ENTRY, describeRun, runCli } from "../../support/e2e/cli.js";
import { installedVersion, installGlobal, latestVersion } from "../../support/e2e/npm-prefix.js";
import { createSandbox, historyEvents, type Sandbox } from "../../support/e2e/sandbox.js";
import { isMutateEnabled } from "../../support/e2e/scope.js";

/**
 * A schedule run for real, on a throw-away npm prefix (GUP_MUTATE=1). The
 * schedule is written into the sandbox the way gup writes it, armed two days
 * ago so that one daily occurrence is due. Then:
 *
 * - `gup schedule run-now` updates its package from the terminal, on every OS;
 * - on Windows, Task Scheduler itself starts the built gup's tick: a
 *   uniquely named `gup-it-<random>` task — never the user's
 *   `gup-scheduler-<SID>` — runs a launcher that starts `node dist/cli.js
 *   __schedule-tick` in the sandbox's environment. The task is deleted, and
 *   verified gone, whatever happens.
 *
 * The OS trigger of `gup schedule add` is never used here: its name is fixed
 * per user, and on a developer's machine it may be the user's real one.
 */

const PACKAGE = "is-number";
const OLD_VERSION = "6.0.0";
const TARGET = `npm-g:${PACKAGE}`;
const DAY_MS = 24 * 60 * 60 * 1000;
const RUN_TIMEOUT_MS = 240_000;
const POLL_MS = 500;
const IS_WINDOWS = process.platform === "win32";

let sandbox: Sandbox;
let latest: string;
let schedule: Schedule;

/** Daily at midnight, armed two days ago: whatever the time, one occurrence is due. */
function seedSchedule(where: Sandbox): Schedule {
  const files = schedulerFiles({ env: where.env });
  if (!files) throw new Error("no scheduler directory in the sandbox");
  return ScheduleRepo.open(files.schedules).create(
    {
      name: "e2e is-number",
      recurrence: { kind: "daily", at: { hour: 0, minute: 0 } },
      targets: [{ providerId: "npm-g", packageId: PACKAGE }],
      enabled: true,
      options: { catchUp: true },
    },
    new Date(Date.now() - 2 * DAY_MS),
  );
}

async function scheduleUpdates(): Promise<UpdateEvent[]> {
  return (await historyEvents(sandbox)).filter(
    (event): event is UpdateEvent =>
      event.kind === "update" && event.scheduleId === schedule.id,
  );
}

async function listedSchedule(): Promise<Record<string, unknown>> {
  const listing = await runCli(["schedule", "list", "--json"], { sandbox });
  expect(listing.code, describeRun(["schedule", "list", "--json"], listing)).toBe(0);
  const parsed = JSON.parse(listing.stdout) as { schedules: Array<Record<string, unknown>> };
  return parsed.schedules.find((entry) => entry["id"] === schedule.id) ?? {};
}

describe.runIf(isMutateEnabled())("a schedule, run for real", { retry: 0 }, () => {
  beforeAll(async () => {
    sandbox = await createSandbox("schedule");
    latest = await latestVersion(sandbox, PACKAGE);
    schedule = seedSchedule(sandbox);
  }, RUN_TIMEOUT_MS);

  afterAll(async () => {
    await sandbox.dispose();
  });

  it("is listed as gup wrote it", async () => {
    expect(await listedSchedule()).toMatchObject({ enabled: true, targets: [TARGET] });
  });

  it(
    "gup schedule run-now updates its package and records the run",
    async ({ annotate }) => {
      await installGlobal(sandbox, [`${PACKAGE}@${OLD_VERSION}`]);
      const args = ["schedule", "run-now", schedule.id];
      const runNow = await runCli(args, { sandbox, timeoutMs: RUN_TIMEOUT_MS });
      expect(runNow.code, describeRun(args, runNow)).toBe(0);

      expect(await installedVersion(sandbox, PACKAGE)).toBe(latest);
      expect((await scheduleUpdates()).at(-1)).toMatchObject({ status: "success", trigger: "cli" });
      expect(await listedSchedule()).toMatchObject({
        lastRun: { kind: "manual", status: "success" },
      });
      await annotate(`run-now ${PACKAGE} ${OLD_VERSION} → ${latest}`);
    },
    RUN_TIMEOUT_MS,
  );

  describe.runIf(IS_WINDOWS)("started by Windows Task Scheduler", () => {
    const taskName = `gup-it-${randomBytes(4).toString("hex")}`;
    const schtasks = join(systemRootOf(process.env), "System32", "schtasks.exe");
    const isRegistered = async (): Promise<boolean> =>
      !(await run(schtasks, ["/Query", "/TN", taskName])).failed;

    afterAll(async () => {
      // Whatever happened above, leave no task behind — and check it is gone.
      await run(schtasks, ["/Delete", "/TN", taskName, "/F"]);
      expect(await isRegistered(), `${taskName} is still registered`).toBe(false);
    });

    it(
      `runs the built tick from a ${taskName} task, which is then deleted`,
      async ({ annotate }) => {
        await installGlobal(sandbox, [`${PACKAGE}@${OLD_VERSION}`]);
        await waitPastBootGrace();
        const launcher = await writeTickLauncher(sandbox);
        const systemRoot = systemRootOf(process.env);
        const trigger = new WindowsTaskTrigger({ systemRoot, taskName });
        const command: TaskCommand = {
          node: process.execPath,
          entry: launcher.script,
          args: [TICK_COMMAND],
        };
        await trigger.install({ command, launcher: "headless" });
        expect(await isRegistered()).toBe(true);

        expect((await run(schtasks, ["/Run", "/TN", taskName])).failed).toBe(false);
        expect(await exitOf(launcher.exitFile)).toEqual({ status: 0, argv: [TICK_COMMAND] });

        expect(await installedVersion(sandbox, PACKAGE)).toBe(latest);
        expect((await scheduleUpdates()).at(-1)).toMatchObject({
          status: "success",
          trigger: "schedule",
        });
        const listed = await listedSchedule();
        expect(listed["lastRun"]).toMatchObject({ status: "success" });
        expect(["on-time", "catch-up"]).toContain((listed["lastRun"] as { kind: string }).kind);

        await trigger.uninstall();
        expect(await isRegistered()).toBe(false);
        await annotate(`${taskName}: tick ${PACKAGE} ${OLD_VERSION} → ${latest}, task deleted`);
      },
      RUN_TIMEOUT_MS + BOOT_GRACE_SECONDS * 1000,
    );
  });
});

interface TickLauncher {
  readonly script: string;
  readonly exitFile: string;
}

/**
 * Task Scheduler starts its tasks in the user's own environment. The launcher
 * it runs starts the built tick in the sandbox's instead (every GUP_*_DIR,
 * the npm prefix), then writes down how it ended.
 */
async function writeTickLauncher(where: Sandbox): Promise<TickLauncher> {
  const script = join(where.root, "tick-launcher.cjs");
  const exitFile = join(where.root, "tick-exit.json");
  const setup = JSON.stringify({ cli: CLI_ENTRY, env: where.env });
  await writeFile(join(where.root, "tick-launcher.json"), setup, "utf8");
  await writeFile(script, TICK_LAUNCHER, "utf8");
  return { script, exitFile };
}

const TICK_LAUNCHER = `"use strict";
const { spawnSync } = require("node:child_process");
const { readFileSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");
const setup = JSON.parse(readFileSync(join(__dirname, "tick-launcher.json"), "utf8"));
const argv = process.argv.slice(2);
const tick = spawnSync(process.execPath, [setup.cli, ...argv], {
  env: setup.env,
  stdio: "inherit",
});
writeFileSync(join(__dirname, "tick-exit.json"), JSON.stringify({ status: tick.status, argv }));
`;

/** The launcher's record of the tick's exit, once it is written. */
async function exitOf(file: string): Promise<unknown> {
  const deadline = Date.now() + RUN_TIMEOUT_MS;
  while (!existsSync(file) && Date.now() < deadline) await delay(POLL_MS);
  return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as unknown) : null;
}

/** A tick right after boot does nothing on purpose; a fresh CI runner may be that young. */
async function waitPastBootGrace(): Promise<void> {
  const missing = BOOT_GRACE_SECONDS + 15 - uptime();
  if (missing > 0) await delay(missing * 1000);
}
