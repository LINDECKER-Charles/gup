import { updateStatusOf } from "../history/store.js";
import type { BatchHolder } from "../update/update-extensions.js";
import type {
  Attempt,
  AttemptResult,
  PlannedUpdate,
  UpdateObserver,
  UpdatePlan,
} from "../update/update-ports.js";
import { log, type LogInput } from "./log.js";

/**
 * The debug log's view of every update run, added to the pipeline's observers
 * whoever drives it (`gup update`, the menu, a scheduled run): what was
 * planned, each attempt and its outcome, the elevated batch, what a stop
 * cancelled, a wait on another gup run. The commands an attempt runs are
 * traced separately (`cmd.*`), under the same provider and package context.
 */

export function createUpdateLogObserver(): UpdateObserver {
  return {
    planned: (plan: UpdatePlan) =>
      log.info("update.planned", { direct: plan.direct.length, elevated: plan.elevated.length }),
    started: (attempt: Attempt) => log.info("update.start", attemptData(attempt)),
    finished: (result: AttemptResult) => {
      const data = { ...attemptData(result), ...outcomeData(result) };
      if (updateStatusOf(result.outcome) === "failed") log.warn("update.end", data);
      else log.info("update.end", data);
    },
    elevationStarted: (items) => log.info("elevation.batch", batchData(items)),
    cancelled: (items) => log.info("update.cancelled", batchData(items)),
    waiting: (holder: BatchHolder) =>
      log.info("update.waiting", { kind: holder.kind, pid: holder.pid, since: holder.startedAt }),
  };
}

function attemptData({ item, retry }: Attempt): LogInput {
  const { providerId, packageId, pkg, scheduleId } = item;
  return {
    providerId,
    packageId,
    ...(pkg?.current !== undefined && { from: pkg.current }),
    ...(pkg?.latest !== undefined && { to: pkg.latest }),
    ...(retry !== undefined && { retry }),
    ...(scheduleId !== undefined && { scheduleId }),
  };
}

function outcomeData({ outcome, durationMs }: AttemptResult): LogInput {
  return {
    status: updateStatusOf(outcome),
    ...(durationMs !== undefined && { ms: durationMs }),
    ...(outcome.message !== undefined && { message: outcome.message }),
  };
}

/** The count is complete; the record's data cap bounds the key list. */
function batchData(items: readonly PlannedUpdate[]): LogInput {
  return { count: items.length, packages: items.map((item) => item.key) };
}
