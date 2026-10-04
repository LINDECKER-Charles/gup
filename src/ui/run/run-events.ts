import { log } from "../../core/log/log.js";
import type {
  Attempt,
  AttemptResult,
  PlannedUpdate,
  UpdateObserver,
} from "../../core/update/update-ports.js";
import { PANE_LABELS, type ElevationKind } from "../text/run-labels.js";
import { labelOf, retryLabelOf, type RunModel } from "./run-model.js";
import { ELEVATED_PANE_KEY, type TerminalPanes } from "./terminal/terminal-panes.js";

/** What the pipeline's events move: the run's model and terminal panes, then the screen. */
export interface RunEventTarget {
  readonly model: RunModel;
  readonly panes: TerminalPanes;
  readonly elevation: ElevationKind;
  /** A package started: the status list follows the package in flight again. */
  readonly onStarted: () => void;
  readonly redraw: () => void;
}

/**
 * The pipeline's side of the run view: each event updates the model and the
 * terminal panes — one per package, one for the elevated step — then the
 * view redraws. An observer must not throw: a drawing problem never stops
 * the updates.
 */
export function runObserver(target: RunEventTarget): UpdateObserver {
  const { model } = target;
  const observe = (event: () => void): void => {
    try {
      event();
      target.redraw();
    } catch (error) {
      log.warn("ui.run-view-failed", { error: messageOf(error) });
    }
  };
  return {
    planned: (plan) => observe(() => model.planned(plan)),
    started: (attempt) => observe(() => started(target, attempt)),
    finished: (result) => observe(() => finished(target, result)),
    elevationStarted: (items) => observe(() => elevationStarted(target, items)),
    cancelled: (items) => observe(() => model.cancelled(items)),
    waiting: (holder) => observe(() => model.waiting(holder)),
  };
}

function started(target: RunEventTarget, { item, retry }: Attempt): void {
  const { model, panes } = target;
  model.started({ item, ...(retry !== undefined && { retry }) });
  target.onStarted();
  panes.open(item.key, PANE_LABELS.title(item.providerName, labelOf(item)));
  if (retry !== undefined) panes.current().note(retryLabelOf(retry));
}

function finished({ model, panes }: RunEventTarget, result: AttemptResult): void {
  model.finished(result);
  panes.settle(result.item.key, result.outcome);
  panes.blur();
}

function elevationStarted(target: RunEventTarget, items: readonly PlannedUpdate[]): void {
  const { model, panes, elevation } = target;
  model.elevationStarted(items);
  panes.open(ELEVATED_PANE_KEY, PANE_LABELS.admin[elevation]);
  if (elevation !== "uac") return;
  const pane = panes.current();
  pane.note(PANE_LABELS.approveUac);
  pane.note(PANE_LABELS.adminElsewhere(items.length));
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
