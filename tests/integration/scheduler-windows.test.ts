import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { run } from "../../src/core/runner.js";
import { InstallRecordStore } from "../../src/core/scheduler/persistence/install-record.js";
import {
  installationProbe,
  TICK_COMMAND,
  type TaskCommand,
} from "../../src/core/scheduler/trigger/task-command.js";
import { systemRootOf } from "../../src/core/scheduler/trigger/trigger-factory.js";
import { TriggerSync } from "../../src/core/scheduler/trigger/trigger-sync.js";
import { WindowsTaskTrigger } from "../../src/core/scheduler/trigger/windows-task.js";

/**
 * Real round trips through Windows Task Scheduler, opt-in (`GUP_MUTATE=1`,
 * Windows only), each on a uniquely named `gup-it-<random>` task: one
 * registered the way gup registers its trigger, read back, started, seen
 * running headless, deleted; one driven by `TriggerSync` as `gup schedule`
 * drives it, from first registration to removal, leaving neither task nor
 * install record. The tasks run a probe script from a temp dir — never gup
 * itself, so the user's real schedules are never read, let alone run — and
 * the user's own trigger (`gup-scheduler-<SID>`) is never touched.
 */

const isEnabled = process.platform === "win32" && process.env["GUP_MUTATE"] === "1";
const TASK_NAME = `gup-it-${randomBytes(4).toString("hex")}`;
const SYNC_TASK_NAME = `${TASK_NAME}-sync`;
const MARKER_WAIT_MS = 30_000;
const POLL_MS = 250;

const PROBE = `
const { writeFileSync } = require("node:fs");
const { join } = require("node:path");
writeFileSync(join(__dirname, "marker.json"), JSON.stringify({
  argv: process.argv.slice(2),
  stdinIsTTY: process.stdin.isTTY === true,
  stdoutIsTTY: process.stdout.isTTY === true,
}));
`;

const systemRoot = systemRootOf(process.env);
const schtasks = join(systemRoot, "System32", "schtasks.exe");
let dir = "";
let probe = "";

beforeAll(async () => {
  if (!isEnabled) return;
  dir = await mkdtemp(join(tmpdir(), "gup-it-task-"));
  probe = join(dir, "probe.cjs");
  await writeFile(probe, PROBE);
});

afterAll(async () => {
  if (!isEnabled) return;
  // Whatever happened below, leave no task behind.
  for (const name of [TASK_NAME, SYNC_TASK_NAME]) await run(schtasks, ["/Delete", "/TN", name, "/F"]);
  if (dir) await rm(dir, { recursive: true, force: true });
});

const probeCommand = (): TaskCommand => ({
  node: process.execPath,
  entry: probe,
  args: [TICK_COMMAND],
});

async function isRegistered(name: string): Promise<boolean> {
  return !(await run(schtasks, ["/Query", "/TN", name])).failed;
}

async function waitFor(file: string): Promise<boolean> {
  for (let waited = 0; waited < MARKER_WAIT_MS; waited += POLL_MS) {
    if (existsSync(file)) return true;
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
  return existsSync(file);
}

describe.runIf(isEnabled)("Windows Task Scheduler round trip (GUP_MUTATE=1)", () => {
  it(
    "creates, describes, runs headless and deletes a uniquely named task",
    async () => {
      const trigger = new WindowsTaskTrigger({ systemRoot, taskName: TASK_NAME });
      await trigger.install({ command: probeCommand(), launcher: "headless" });
      expect(await trigger.status()).toEqual({ isInstalled: true, isDisabledByUser: false });

      // Task Scheduler hands back its normalised definition: values equal to
      // their default (RunLevel LeastPrivilege, Priority 7) are left out.
      const query = await run(schtasks, ["/Query", "/TN", TASK_NAME, "/XML"]);
      expect(query.failed).toBe(false);
      const expectations = [
        "<LogonType>InteractiveToken</LogonType>",
        "<Interval>PT15M</Interval>",
        "<MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>",
        "<DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>",
        "<ExecutionTimeLimit>PT3H</ExecutionTimeLimit>",
        `<Arguments>--headless "${process.execPath}" "${probe}" ${TICK_COMMAND}</Arguments>`,
      ];
      for (const expected of expectations) expect(query.stdout).toContain(expected);
      expect(query.stdout).not.toContain("HighestAvailable");

      expect((await run(schtasks, ["/Run", "/TN", TASK_NAME])).failed).toBe(false);
      const marker = join(dir, "marker.json");
      expect(await waitFor(marker)).toBe(true);
      expect(JSON.parse(readFileSync(marker, "utf8"))).toEqual({
        argv: [TICK_COMMAND],
        // conhost --headless gives the child a console: why the tick sets GUP_NONINTERACTIVE.
        stdinIsTTY: true,
        stdoutIsTTY: true,
      });

      await trigger.uninstall();
      expect(await trigger.status()).toEqual({ isInstalled: false, isDisabledByUser: false });
      expect(await isRegistered(TASK_NAME)).toBe(false);
    },
    MARKER_WAIT_MS * 2,
  );

  it("registers through TriggerSync, then removes the task and its record: nothing left", async () => {
    const records = new InstallRecordStore(join(dir, "install.json"));
    const sync = new TriggerSync({
      trigger: new WindowsTaskTrigger({ systemRoot, taskName: SYNC_TASK_NAME }),
      records,
      current: () => ({ command: probeCommand(), env: {} }),
      probe: installationProbe("win32"),
      clock: () => new Date(),
      gupVersion: "it",
      platform: "win32",
    });

    expect(await sync.reconcile(1)).toEqual({ kind: "installed" });
    expect(await isRegistered(SYNC_TASK_NAME)).toBe(true);
    expect(records.read()?.argv).toEqual([process.execPath, probe, TICK_COMMAND]);
    // Registered, recorded and present: an interactive start changes nothing.
    expect(await sync.heal(1)).toEqual({ kind: "unchanged" });

    // The last schedule switched off: the task and its record go.
    expect(await sync.reconcile(0)).toEqual({ kind: "removed" });
    expect(await isRegistered(SYNC_TASK_NAME)).toBe(false);
    expect(existsSync(join(dir, "install.json"))).toBe(false);
    // `gup schedule uninstall` with nothing registered is not an error.
    expect(await sync.remove()).toEqual({ kind: "removed" });
  });
});
