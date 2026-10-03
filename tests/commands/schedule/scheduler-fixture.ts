import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  CommandOutput,
  SchedulerServices,
} from "../../../src/commands/schedule/scheduler-services.js";
import { InstallRecordStore } from "../../../src/core/scheduler/persistence/install-record.js";
import { RunStateStore } from "../../../src/core/scheduler/persistence/run-state.js";
import { ScheduleRepo } from "../../../src/core/scheduler/persistence/schedule-repo.js";
import { schedulerFiles } from "../../../src/core/scheduler/persistence/scheduler-files.js";
import type { TargetScan } from "../../../src/core/scheduler/target-resolver.js";
import { TICK_COMMAND } from "../../../src/core/scheduler/trigger/task-command.js";
import { TriggerSync } from "../../../src/core/scheduler/trigger/trigger-sync.js";
import { FakeTrigger } from "../../core/scheduler/fake-trigger.js";
import { providerFacts } from "../../core/scheduler/scheduler-fixtures.js";

/**
 * Scheduler services for command tests: real stores in a private temp dir,
 * an in-memory OS trigger, a fake registry (winget, npm-g, choco admin-only)
 * and a scripted targeted scan. Nothing reaches the machine.
 */

export const NOW = new Date("2026-10-03T10:00:00Z");
export const GUP_ENTRY = "/usr/lib/node_modules/@charles_lindecker/gup/dist/cli.js";

export interface Captured extends CommandOutput {
  readonly lines: string[];
  readonly errors: string[];
  text(): string;
}

export function captured(): Captured {
  const lines: string[] = [];
  const errors: string[] = [];
  return {
    lines,
    errors,
    out: (line) => void lines.push(line),
    err: (line) => void errors.push(line),
    text: () => [...lines, ...errors].join("\n"),
  };
}

export interface Fixture {
  readonly services: SchedulerServices;
  readonly trigger: FakeTrigger;
  readonly output: Captured;
  readonly scanned: string[][];
  readonly clock: { now: Date };
  cleanup(): Promise<void>;
}

export interface FixtureOptions {
  readonly scan?: TargetScan;
  readonly isUnsupported?: boolean;
  readonly isDirOverridden?: boolean;
}

export async function schedulerFixture(options: FixtureOptions = {}): Promise<Fixture> {
  const dir = await mkdtemp(join(tmpdir(), "gup-schedule-cmd-"));
  const files = schedulerFiles({ env: { GUP_SCHEDULER_DIR: dir } })!;
  const clock = { now: NOW };
  const trigger = new FakeTrigger();
  const installs = new InstallRecordStore(files.install);
  const scanned: string[][] = [];
  const services: SchedulerServices = {
    clock: () => clock.now,
    files,
    repo: ScheduleRepo.open(files.schedules),
    state: new RunStateStore(files.state),
    installs,
    trigger: options.isUnsupported ? { unsupported: "planification non prise en charge sous freebsd" } : trigger,
    sync: options.isUnsupported ? null : syncFor(trigger, { installs, clock }),
    providers: providerFacts({
      winget: { displayName: "Winget" },
      "npm-g": { displayName: "npm (global)" },
      choco: { displayName: "Chocolatey", canUpdateUnattended: false },
    }),
    scanner: async (ids) => {
      scanned.push([...ids]);
      return options.scan ?? { results: [], available: new Set() };
    },
    uptimeSeconds: () => 86_400,
    isDirOverridden: options.isDirOverridden ?? false,
  };
  const cleanup = () => rm(dir, { recursive: true, force: true });
  return { services, trigger, output: captured(), scanned, clock, cleanup };
}

function syncFor(
  trigger: FakeTrigger,
  context: { readonly installs: InstallRecordStore; readonly clock: { now: Date } },
): TriggerSync {
  return new TriggerSync({
    trigger,
    records: context.installs,
    current: () => ({
      command: { node: "/usr/bin/node", entry: GUP_ENTRY, args: [TICK_COMMAND] },
      env: {},
    }),
    probe: { exists: () => true, packageRoot: (entry) => entry.replace(/\/dist\/cli\.js$/, "") },
    clock: () => context.clock.now,
    gupVersion: "0.5.0",
    platform: "linux",
  });
}
