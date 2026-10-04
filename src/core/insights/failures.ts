import type { FailureGroup, TimedUpdate } from "./types.js";

/**
 * Failed attempts grouped by package and reason: a package that fails every
 * week for the same reason is one line with a count, not fifty. Messages are
 * compared on their first line, whitespace collapsed — the part that names
 * the cause, without the timestamps and progress lines tools add after it.
 */

export const MAX_FAILURE_MESSAGE = 160;

const KEY_SEPARATOR = "\u0000";
const FIRST_LINE = /^[^\r\n]*/;
const SPACES = /\s+/g;

export function failureGroups(updates: readonly TimedUpdate[]): FailureGroup[] {
  const groups = new Map<string, Mutable<FailureGroup>>();
  for (const { event } of updates) {
    if (event.status !== "failed") continue;
    const message = normalizeMessage(event.message);
    const key = [event.providerId, event.packageId, message].join(KEY_SEPARATOR);
    const group = groups.get(key);
    if (group) {
      group.count += 1;
      group.lastAt = event.ts;
    } else {
      const { providerId, packageId, ts } = event;
      groups.set(key, { providerId, packageId, message, count: 1, lastAt: ts });
    }
  }
  return [...groups.values()].sort((a, b) => b.count - a.count || (a.lastAt < b.lastAt ? 1 : -1));
}

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

/** The first line of `message`, whitespace collapsed, bounded; empty when there is none. */
export function normalizeMessage(message: string | undefined): string {
  const firstLine = FIRST_LINE.exec((message ?? "").trimStart())?.[0] ?? "";
  return firstLine.replace(SPACES, " ").trim().slice(0, MAX_FAILURE_MESSAGE);
}
