import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

/**
 * What this gup process is doing, readable from anywhere without threading it
 * through every call: the process-wide run (its id, what started it) and the
 * operation in flight on the current async path (which provider a concurrent
 * scan task, or an update, belongs to). History records and log lines stamp
 * themselves from here.
 */

/** What started this process: the interactive menu, a command line, or a schedule. */
export type RunTrigger = "menu" | "cli" | "schedule";

/**
 * One id per gup process, stamped on every record it emits. It makes "which
 * updates followed this scan" answerable without relying on timestamp
 * proximity, and ties log lines to the history of the same run.
 */
export const RUN_ID: string = randomUUID();

let trigger: RunTrigger | undefined;

/** Record what started this process. Called once, by the CLI startup hook. */
export function setRunTrigger(value: RunTrigger): void {
  trigger = value;
}

/** What started this process, or undefined before the CLI startup ran (library use, tests). */
export function runTrigger(): RunTrigger | undefined {
  return trigger;
}

/** The unit of work in flight: a provider probe, a provider scan, or one package update. */
export interface OperationContext {
  readonly op: "detect" | "scan" | "update";
  readonly providerId?: string;
  readonly packageId?: string;
}

const operations = new AsyncLocalStorage<OperationContext>();

/**
 * Run `work` with `context` as the current operation, across every await it
 * makes. Concurrent tasks each see their own context: a scan of eight
 * providers at once attributes every spawned command to the right provider.
 */
export function withOperation<T>(context: OperationContext, work: () => T): T {
  return operations.run(context, work);
}

/** The operation the calling code runs under, or undefined outside of any. */
export function currentOperation(): OperationContext | undefined {
  return operations.getStore();
}
