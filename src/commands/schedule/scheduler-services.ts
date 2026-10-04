import { homedir, uptime } from "node:os";
import { localize } from "../../core/i18n/localized.js";
import { lookupProvider } from "../../core/platform/lookup-provider.js";
import type { ProviderFacts } from "../../core/scheduler/model/types.js";
import {
  InstallRecordStore,
  type InstallRecord,
} from "../../core/scheduler/persistence/install-record.js";
import { RunStateStore } from "../../core/scheduler/persistence/run-state.js";
import { ScheduleRepo } from "../../core/scheduler/persistence/schedule-repo.js";
import {
  schedulerFiles,
  type SchedulerFiles,
} from "../../core/scheduler/persistence/scheduler-files.js";
import { captureEnv } from "../../core/scheduler/trigger/captured-env.js";
import type {
  Mechanism,
  OsTrigger,
  TriggerStatus,
} from "../../core/scheduler/trigger/os-trigger.js";
import {
  currentInstallationFacts,
  installationProbe,
  resolveTaskCommand,
} from "../../core/scheduler/trigger/task-command.js";
import {
  osTriggerFor,
  type TriggerChoice,
} from "../../core/scheduler/trigger/trigger-factory.js";
import { assessTrigger, type TriggerHealth } from "../../core/scheduler/trigger/trigger-health.js";
import {
  TriggerSync,
  type CurrentRegistration,
} from "../../core/scheduler/trigger/trigger-sync.js";
import type { TargetScanner } from "../../core/scheduler/target-resolver.js";
import { gupVersion } from "../../core/version.js";
import { targetScanner } from "./run-deps.js";

/**
 * The scheduler wired to this machine: its files, stores, OS trigger and
 * the registry, built once per command. Commands receive it as a parameter,
 * so their tests hand them sandboxed stores and a fake trigger.
 */

export interface SchedulerServices {
  readonly clock: () => Date;
  readonly files: SchedulerFiles;
  readonly repo: ScheduleRepo;
  readonly state: RunStateStore;
  readonly installs: InstallRecordStore;
  readonly trigger: TriggerChoice;
  /** Null where the platform has no trigger. */
  readonly sync: TriggerSync | null;
  readonly providers: ProviderFacts;
  /** Detects and scans the providers a run needs. */
  readonly scanner: TargetScanner;
  readonly uptimeSeconds: () => number;
  /** The scheduler dir comes from GUP_SCHEDULER_DIR, which the OS trigger will not see. */
  readonly isDirOverridden: boolean;
}

/** Where commands write: stdout and stderr in production, buffers in tests. */
export interface CommandOutput {
  out(line: string): void;
  err(line: string): void;
}

export const CONSOLE_OUTPUT: CommandOutput = {
  out: (line) => void process.stdout.write(`${line}\n`),
  err: (line) => void process.stderr.write(`${line}\n`),
};

/** Why there is no scheduler: the platform gives no state dir. */
function noStateDir(): string {
  return localize({
    en: "no scheduling location available on this machine",
    fr: "emplacement de planification indisponible sur cette machine",
  });
}

/** Provider facts from the registry: unknown and foreign ids fail with lookupProvider's reason. */
export const REGISTRY_PROVIDER_FACTS: ProviderFacts = {
  lookup(providerId) {
    const found = lookupProvider(providerId);
    if (!found.isFound) return { isFound: false, error: found.error };
    return {
      isFound: true,
      displayName: found.provider.displayName,
      canUpdateUnattended: found.provider.canUpdateUnattended !== false,
    };
  },
};

export function schedulerServices(): SchedulerServices | { readonly error: string } {
  const files = schedulerFiles();
  if (files === null) return { error: noStateDir() };
  const clock = (): Date => new Date();
  const installs = new InstallRecordStore(files.install);
  const trigger = osTriggerFor({
    platform: process.platform,
    env: process.env,
    home: homedir(),
    uid: process.getuid?.(),
    agentStderr: files.agentStderr,
  });
  return {
    clock,
    files,
    repo: ScheduleRepo.open(files.schedules),
    state: new RunStateStore(files.state),
    installs,
    trigger,
    sync: "unsupported" in trigger ? null : triggerSync(trigger, { installs, clock }),
    providers: REGISTRY_PROVIDER_FACTS,
    scanner: targetScanner,
    uptimeSeconds: uptime,
    isDirOverridden: Boolean(process.env["GUP_SCHEDULER_DIR"]),
  };
}

let shared: ReturnType<typeof schedulerServices> | undefined;

/**
 * The process's scheduler services, built on first use: the CLI module and
 * the menu's Schedules view share one set of stores and one trigger.
 */
export function processSchedulerServices(): SchedulerServices | { readonly error: string } {
  return (shared ??= schedulerServices());
}

function triggerSync(
  trigger: OsTrigger,
  context: { readonly installs: InstallRecordStore; readonly clock: () => Date },
): TriggerSync {
  return new TriggerSync({
    trigger,
    records: context.installs,
    current: currentRegistration,
    probe: installationProbe(process.platform),
    clock: context.clock,
    gupVersion: gupVersion(),
    platform: process.platform,
  });
}

/** The running gup as the OS trigger would register it. */
function currentRegistration(): CurrentRegistration | { readonly error: string } {
  const command = resolveTaskCommand(currentInstallationFacts());
  if ("error" in command) return command;
  return { command, env: captureEnv(process.env, process.platform) };
}

export interface TriggerReport {
  readonly health: TriggerHealth;
  readonly mechanism: Mechanism | null;
  readonly record: InstallRecord | null;
  readonly status: TriggerStatus;
  readonly enabledCount: number;
  readonly unsupported?: string;
}

const NOT_INSTALLED: TriggerStatus = { isInstalled: false, isDisabledByUser: false };

/** What `list`, `status` and `gup doctor` say about the trigger. */
export async function readTriggerReport(services: SchedulerServices): Promise<TriggerReport> {
  const enabledCount = services.repo.list().filter((schedule) => schedule.enabled).length;
  const record = services.installs.read();
  const { trigger } = services;
  if ("unsupported" in trigger) {
    const health: TriggerHealth = { kind: enabledCount === 0 ? "none" : "not-installed" };
    const { unsupported } = trigger;
    return { health, mechanism: null, record, status: NOT_INSTALLED, enabledCount, unsupported };
  }
  const status = enabledCount === 0 && !record ? NOT_INSTALLED : await trigger.status();
  const health = assessTrigger({
    enabledCount,
    record,
    status,
    match: record ? (services.sync?.matchOf(record) ?? null) : null,
    lastTickAt: services.state.read().lastTickAt,
    now: services.clock(),
    uptimeSeconds: services.uptimeSeconds(),
  });
  return { health, mechanism: trigger.mechanism, record, status, enabledCount };
}
