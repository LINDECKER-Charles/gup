import { recordScan, recordUpdate } from "../../core/history/store.js";
import { log } from "../../core/log/log.js";
import { routeInheritTo } from "../../core/process/inherit-sink.js";
import { ALL_PROVIDERS, detectAvailableProviders, scanAll } from "../../core/registry.js";
import { createPipeSink, skipCurrent } from "../../core/runner.js";
import type {
  ScheduledRunDeps,
  SkippedTarget,
  TickExecutor,
} from "../../core/scheduler/scheduled-run.js";
import { MAX_RUN_MINUTES } from "../../core/scheduler/scheduler-timing.js";
import { TargetResolver, type TargetScanner } from "../../core/scheduler/target-resolver.js";
import { BatchLock, batchLockLocation } from "../../core/update/batch-lock.js";
import { HEADLESS_DECISIONS, runUpdates } from "../../core/update/update-pipeline.js";
import type { UpdateObserver } from "../../core/update/update-ports.js";
import type { SchedulerServices } from "./scheduler-services.js";

/**
 * The scheduler's core wired to gup's: the targeted scan (recorded in the
 * history like any scan), the update pipeline nobody watches, the update
 * batch, the history of skipped targets.
 */

/** Bytes of one install's output kept in the log, per stream. */
const CHILD_OUTPUT_LOG_CAP_BYTES = 256 * 1024;
const MINUTE_MS = 60_000;

/** Detect then scan exactly `providerIds` — never the 150 others — and record the scan. */
export const targetScanner: TargetScanner = async (providerIds) => {
  const only = [...providerIds];
  const startedAt = Date.now();
  const candidates = ALL_PROVIDERS.filter((provider) => only.includes(provider.id));
  const detected = await detectAvailableProviders(candidates);
  const results = await scanAll({ detected, only });
  recordScan({ results, durationMs: Date.now() - startedAt, options: { only } });
  return { results, available: new Set(detected.map((provider) => provider.id)) };
};

/** Resolve schedules to updates with the services' scanner and registry. */
export function targetResolver(services: SchedulerServices): TargetResolver {
  return new TargetResolver({ scanner: services.scanner, providers: services.providers });
}

export function buildRunDeps(services: SchedulerServices): ScheduledRunDeps {
  return {
    clock: services.clock,
    schedules: () => services.repo.list(),
    state: services.state,
    batch: {
      tryAcquire: async () => {
        const location = batchLockLocation();
        if (location === null) return { busy: null };
        return BatchLock.tryAcquire(location, "scheduled");
      },
    },
    resolver: targetResolver(services),
    execute: headlessExecutor,
    recordSkipped,
    interruptCurrent: () => void skipCurrent(),
    deadlineMs: MAX_RUN_MINUTES * MINUTE_MS,
  };
}

/**
 * The pipeline with no one at the keyboard: never elevate, never retry,
 * tell providers not to prompt, installers' output line by line to the log
 * (stdin closed), and no batch guard — the tick already holds the batch.
 */
const headlessExecutor: TickExecutor = async (requests, gate) => {
  const sink = createPipeSink({
    capBytes: CHILD_OUTPUT_LOG_CAP_BYTES,
    onLine: (line, stream) => log.info("scheduler.install-output", { stream, line }),
  });
  const restore = routeInheritTo(sink);
  try {
    return await runUpdates(requests, {
      observer: SILENT_OBSERVER,
      decisions: HEADLESS_DECISIONS,
      gate,
      batch: "scheduled",
    });
  } finally {
    restore();
  }
};

/** A target settled as skipped before any install still shows in the history. */
function recordSkipped(target: SkippedTarget): void {
  recordUpdate({
    providerId: target.providerId,
    outcome: { id: target.packageId, success: false, skipped: true, message: target.message },
    scheduleId: target.scheduleId,
  });
}

/** Nobody watches a scheduled run; process-wide observers (the debug log) still hear it. */
const SILENT_OBSERVER: UpdateObserver = {
  planned: () => {},
  started: () => {},
  finished: () => {},
  elevationStarted: () => {},
  cancelled: () => {},
  waiting: () => {},
};
