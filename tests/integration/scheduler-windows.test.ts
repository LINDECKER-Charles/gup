import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { run } from "../../src/core/runner.js";
import { TICK_COMMAND } from "../../src/core/scheduler/trigger/task-command.js";
import { systemRootOf } from "../../src/core/scheduler/trigger/trigger-factory.js";
import { WindowsTaskTrigger } from "../../src/core/scheduler/trigger/windows-task.js";

/**
 * One real round trip through Windows Task Scheduler, opt-in (`GUP_MUTATE=1`,
 * Windows only): register a uniquely named `gup-it-<random>` task the way
 * gup registers its trigger, read its definition back, start it, see the
 * headless tick run, delete it and verify it is gone. The task runs a probe
 * script from a temp dir — never gup itself, so the user's real schedules
 * are never read, let alone run — and the user's own trigger
 * (`gup-scheduler-<SID>`) is never touched.
 */

const isEnabled = process.platform === "win32" && process.env["GUP_MUTATE"] === "1";
const TASK_NAME = `gup-it-${randomBytes(4).toString("hex")}`;
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
const trigger = new WindowsTaskTrigger({ systemRoot, taskName: TASK_NAME });
let dir = "";

afterAll(async () => {
  if (!isEnabled) return;
  // Whatever happened above, leave no task behind.
  await run(schtasks, ["/Delete", "/TN", TASK_NAME, "/F"]);
  if (dir) await rm(dir, { recursive: true, force: true });
});

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
      dir = await mkdtemp(join(tmpdir(), "gup-it-task-"));
      const probe = join(dir, "probe.cjs");
      await writeFile(probe, PROBE);
      const command = { node: process.execPath, entry: probe, args: [TICK_COMMAND] as const };

      await trigger.install({ command, launcher: "headless" });
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
      expect((await run(schtasks, ["/Query", "/TN", TASK_NAME])).failed).toBe(true);
    },
    MARKER_WAIT_MS * 2,
  );
});
