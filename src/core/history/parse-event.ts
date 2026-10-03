import type { RunTrigger } from "../state/run-context.js";
import {
  HISTORY_SCHEMA_VERSION,
  type HistoryEnvelope,
  type HistoryEvent,
  type ScanEvent,
  type ScanProviderRecord,
  type UpdateEvent,
  type UpdateStatus,
} from "./types.js";

/**
 * One line of a history shard, read back strictly: the known fields of a v1
 * record, type-checked and copied into a fresh object — never the parsed
 * object itself, never a spread of it, so an unknown key (a field a newer
 * gup added) is dropped and nothing on a prototype is ever read.
 *
 * A line is `malformed` when it is not a record gup wrote (not JSON, a
 * known field of the wrong type, a torn last line, a line no writer would
 * produce), and `unsupported` when it is a well-formed record from a newer
 * gup: a higher schema version, a record kind or an outcome this reader
 * does not know. Neither stops the reading: they are counted.
 */

export type ParsedLine =
  | { readonly kind: "event"; readonly event: HistoryEvent }
  | { readonly kind: "malformed" }
  | { readonly kind: "unsupported" };

/** A longer line is not one the store wrote: its records are a few hundred bytes. */
export const MAX_HISTORY_LINE_LENGTH = 64 * 1024;
/** Every string read is cut to this many characters. */
export const MAX_FIELD_LENGTH = 4096;

const MALFORMED: ParsedLine = { kind: "malformed" };
const UNSUPPORTED: ParsedLine = { kind: "unsupported" };
const TRIGGERS: ReadonlySet<string> = new Set<RunTrigger>(["menu", "cli", "schedule"]);
const STATUSES: ReadonlySet<string> = new Set<UpdateStatus>(["success", "failed", "skipped"]);

type JsonObject = { readonly [key: string]: unknown };

/** Thrown inside the parser to abandon a line; never leaves this module. */
class LineRejected extends Error {
  constructor(readonly verdict: ParsedLine) {
    super(verdict.kind);
  }
}

export function parseHistoryLine(line: string): ParsedLine {
  if (line.length > MAX_HISTORY_LINE_LENGTH) return MALFORMED;
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return MALFORMED;
  }
  try {
    return { kind: "event", event: eventOf(asObject(parsed)) };
  } catch (error) {
    if (error instanceof LineRejected) return error.verdict;
    throw error;
  }
}

function eventOf(record: JsonObject): HistoryEvent {
  checkVersion(record["v"]);
  const kind = record["kind"];
  if (kind === "update") return updateOf(record);
  if (kind === "scan") return scanOf(record);
  throw new LineRejected(typeof kind === "string" ? UNSUPPORTED : MALFORMED);
}

function checkVersion(version: unknown): void {
  if (version === HISTORY_SCHEMA_VERSION) return;
  const isNewer = Number.isInteger(version) && (version as number) > HISTORY_SCHEMA_VERSION;
  throw new LineRejected(isNewer ? UNSUPPORTED : MALFORMED);
}

function envelopeOf(record: JsonObject): Omit<HistoryEnvelope, "kind"> {
  const ts = requiredText(record, "ts");
  const at = Date.parse(ts);
  if (Number.isNaN(at)) throw new LineRejected(MALFORMED);
  const trigger = optionalText(record, "trigger");
  return {
    v: HISTORY_SCHEMA_VERSION,
    ts: new Date(at).toISOString(),
    runId: requiredText(record, "runId"),
    gup: requiredText(record, "gup"),
    platform: requiredText(record, "platform"),
    // An unknown trigger is a newer gup's: the record stays, without it.
    ...(trigger !== undefined && TRIGGERS.has(trigger) && { trigger: trigger as RunTrigger }),
  };
}

function updateOf(record: JsonObject): UpdateEvent {
  const status = requiredText(record, "status");
  if (!STATUSES.has(status)) throw new LineRejected(UNSUPPORTED);
  return {
    ...envelopeOf(record),
    kind: "update",
    providerId: requiredText(record, "providerId"),
    packageId: requiredText(record, "packageId"),
    status: status as UpdateStatus,
    ...optionalTexts(record, ["from", "to", "message", "retry", "scheduleId"]),
    ...optionalCounts(record, ["durationMs"]),
    ...(optionalFlag(record, "elevated") && { elevated: true }),
  };
}

function scanOf(record: JsonObject): ScanEvent {
  const providers = record["providers"];
  const filter = record["filter"];
  if (!Array.isArray(providers) || !Array.isArray(filter)) throw new LineRejected(MALFORMED);
  return {
    ...envelopeOf(record),
    kind: "scan",
    durationMs: requiredCount(record, "durationMs"),
    fast: requiredFlag(record, "fast"),
    filter: filter.map((id) => textOf(id)),
    providers: providers.map((provider) => providerOf(asObject(provider))),
    outdated: requiredCount(record, "outdated"),
  };
}

function providerOf(record: JsonObject): ScanProviderRecord {
  return {
    providerId: requiredText(record, "providerId"),
    outdated: requiredCount(record, "outdated"),
    ...optionalTexts(record, ["error"]),
    ...optionalCounts(record, ["durationMs"]),
  };
}

function asObject(value: unknown): JsonObject {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new LineRejected(MALFORMED);
  }
  return value as JsonObject;
}

/** A non-empty string, cut to {@link MAX_FIELD_LENGTH}. */
function textOf(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) throw new LineRejected(MALFORMED);
  return value.slice(0, MAX_FIELD_LENGTH);
}

function requiredText(record: JsonObject, key: string): string {
  return textOf(record[key]);
}

function optionalText(record: JsonObject, key: string): string | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new LineRejected(MALFORMED);
  return value.slice(0, MAX_FIELD_LENGTH);
}

/** The optional string fields that are present, under their own names. */
function optionalTexts<K extends string>(
  record: JsonObject,
  keys: readonly K[],
): Partial<Record<K, string>> {
  const texts: Partial<Record<K, string>> = {};
  for (const key of keys) {
    const value = optionalText(record, key);
    if (value !== undefined) texts[key] = value;
  }
  return texts;
}

/** A finite, non-negative number. */
function requiredCount(record: JsonObject, key: string): number {
  const value = record[key];
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new LineRejected(MALFORMED);
  }
  return value;
}

function optionalCounts<K extends string>(
  record: JsonObject,
  keys: readonly K[],
): Partial<Record<K, number>> {
  const counts: Partial<Record<K, number>> = {};
  for (const key of keys) {
    if (record[key] !== undefined) counts[key] = requiredCount(record, key);
  }
  return counts;
}

function requiredFlag(record: JsonObject, key: string): boolean {
  const value = record[key];
  if (typeof value !== "boolean") throw new LineRejected(MALFORMED);
  return value;
}

function optionalFlag(record: JsonObject, key: string): boolean {
  return record[key] === undefined ? false : requiredFlag(record, key);
}
