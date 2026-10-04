import type { SchedulerServices } from "../../../../src/commands/schedule/scheduler-services.js";
import { SchedulesController } from "../../../../src/commands/schedule/schedules-controller.js";
import { ConfigStore } from "../../../../src/core/config/store.js";
import { isSupportedOn } from "../../../../src/core/platform/is-supported-on.js";
import type { ProviderFacts } from "../../../../src/core/scheduler/model/types.js";
import { InstallRecordStore } from "../../../../src/core/scheduler/persistence/install-record.js";
import { RunStateStore } from "../../../../src/core/scheduler/persistence/run-state.js";
import { ScheduleRepo } from "../../../../src/core/scheduler/persistence/schedule-repo.js";
import {
  purgeSchedulerFiles,
  schedulerFiles,
  type SchedulerFiles,
} from "../../../../src/core/scheduler/persistence/scheduler-files.js";
import { TICK_COMMAND } from "../../../../src/core/scheduler/trigger/task-command.js";
import { gupVersion } from "../../../../src/core/version.js";
import { FIXTURE_PLATFORM } from "../machine.js";
import { registeredProvider } from "../registered-provider.js";
import { FixtureTrigger } from "./fixture-trigger.js";
import { SCHEDULES_FIXTURE } from "./schedule-data.js";

/** The last tick of the OS trigger: a few minutes ago, so its health reads "active". */
const LAST_TICK_AGO_MS = 4 * 60_000;
/** A machine up for a day: long enough for a silent trigger to count as stale. */
const UPTIME_SECONDS = 86_400;
/** What `install.json` records as registered: neutral paths, never the renderer's. */
const REGISTERED_ARGV = [
  "C:\\Program Files\\nodejs\\node.exe",
  "C:\\Users\\dev\\AppData\\Roaming\\npm\\node_modules\\@charles_lindecker\\gup\\dist\\cli.js",
  TICK_COMMAND,
] as const;

/**
 * The scheduler's view of a provider on the fixture machine: the real
 * registry, judged on {@link FIXTURE_PLATFORM} — a Linux runner checking the
 * screenshots must not find winget "unavailable here".
 */
const FIXTURE_PROVIDER_FACTS: ProviderFacts = {
  lookup(providerId) {
    const provider = registeredProvider(providerId);
    if (!isSupportedOn(provider, FIXTURE_PLATFORM)) {
      return { isFound: false, error: `${providerId} : absent de la machine fixture` };
    }
    const canUpdateUnattended = provider.canUpdateUnattended !== false;
    return { isFound: true, displayName: provider.displayName, canUpdateUnattended };
  },
};

/**
 * The menu's Planification port on the fixture machine: the real
 * `SchedulesController` over the real stores, in the sandbox's scheduler
 * directory (`GUP_SCHEDULER_DIR`), written afresh with `SCHEDULES_FIXTURE`,
 * their last runs and a healthy Task Scheduler entry. The OS trigger is a
 * fixture that answers from memory and refuses changes; nothing scans.
 */
export function fixtureSchedules(now: Date): SchedulesController {
  const files = schedulerFiles();
  if (files === null) throw new Error("the schedules fixture has nowhere to go: no scheduler dir");
  purgeSchedulerFiles(files);
  writeSchedules(files, now);
  const services = fixtureServices(files);
  return new SchedulesController(() => services);
}

function writeSchedules(files: SchedulerFiles, now: Date): void {
  const ids = SCHEDULES_FIXTURE.map((schedule) => schedule.id).values();
  const repo = new ScheduleRepo(
    () => new ConfigStore({ file: files.schedules }),
    () => ids.next().value ?? "",
  );
  for (const { draft, createdAt } of SCHEDULES_FIXTURE) repo.create(draft, new Date(createdAt));
  // Every run was seen when the screenshots are taken: no "!" badge, no title-bar fact.
  repo.markSeen(now);
  new RunStateStore(files.state).update(() => ({
    v: 1,
    lastTickAt: new Date(now.getTime() - LAST_TICK_AGO_MS).toISOString(),
    schedules: Object.fromEntries(
      SCHEDULES_FIXTURE.map(({ id, lastRun }) => [
        id,
        { lastAttemptAt: lastRun.startedAt, lastRun },
      ]),
    ),
  }));
  new InstallRecordStore(files.install).write({
    v: 1,
    platform: FIXTURE_PLATFORM,
    mechanism: "windows-task",
    launcher: "headless",
    argv: REGISTERED_ARGV,
    env: {},
    installedAt: SCHEDULES_FIXTURE[0]?.createdAt ?? now.toISOString(),
    gupVersion: gupVersion(),
  });
}

function fixtureServices(files: SchedulerFiles): SchedulerServices {
  return {
    clock: () => new Date(),
    files,
    repo: ScheduleRepo.open(files.schedules),
    state: new RunStateStore(files.state),
    installs: new InstallRecordStore(files.install),
    trigger: new FixtureTrigger(),
    // No registration to reconcile: the fixture trigger is registered and stays so.
    sync: null,
    providers: FIXTURE_PROVIDER_FACTS,
    scanner: () => Promise.reject(new Error("a screenshot never scans for a schedule")),
    uptimeSeconds: () => UPTIME_SECONDS,
    isDirOverridden: false,
  };
}
