import type { OperationContext } from "../state/run-context.js";
import { isSecretName, REDACTED, redactedHead } from "./redact.js";
import type { LogData, LogRecord, LogValue } from "./types.js";

/**
 * A log record's `data`, made safe to write: a bounded deep copy holding JSON
 * values only, every string — keys included — through `redactText` (secrets,
 * home), values under a secret-looking key masked whatever their shape. Callers pass whatever they
 * have (an Error, a Date, a nested object); nothing they pass can make a line
 * huge, leak a token, or smuggle a prototype.
 */

export const MAX_STRING = 2000;
export const MAX_KEYS = 32;
export const MAX_ITEMS = 50;
export const MAX_DEPTH = 3;
/** Characters of string content per record, all strings together. */
export const MAX_TOTAL_CHARS = 16_384;
/** An Error's stack keeps more room than a plain string: it is the point of logging it. */
const MAX_STACK = 4000;
const TRUNCATED = "…";
/** Provider and package ids in a record's context. */
const MAX_ID_LENGTH = 256;

const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/** The remaining string allowance of one record. */
interface Budget {
  chars: number;
}

/** `data` as a safe {@link LogData}, or undefined when there is nothing (or nothing usable). */
export function sanitizeData(data: unknown): LogData | undefined {
  if (!isPlainObject(data) && !(data instanceof Error)) return undefined;
  const value = sanitizeValue(data, 0, { chars: MAX_TOTAL_CHARS });
  if (value === undefined || typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  return Object.keys(value).length > 0 ? (value as LogData) : undefined;
}

/** An operation context with its known fields only, ids bounded and redacted. */
export function sanitizeContext(context: OperationContext): OperationContext {
  const { op, providerId, packageId } = context;
  return {
    op,
    ...(providerId !== undefined && { providerId: boundedId(providerId) }),
    ...(packageId !== undefined && { packageId: boundedId(packageId) }),
  };
}

/**
 * A record read back — another process's, an older file's — with today's
 * redaction applied again: rules improve, and a record that crossed a
 * process boundary is not trusted to have been through them.
 */
export function resanitizeRecord(record: LogRecord): LogRecord {
  const { ctx, data, ...envelope } = record;
  const cleanContext = ctx && sanitizeContext(ctx);
  const cleanData = sanitizeData(data);
  return {
    ...envelope,
    ...(cleanContext && { ctx: cleanContext }),
    ...(cleanData && { data: cleanData }),
  };
}

function boundedId(id: string): string {
  return redactedHead(id, MAX_ID_LENGTH);
}

function sanitizeValue(value: unknown, depth: number, budget: Budget): LogValue | undefined {
  if (value === null) return null;
  switch (typeof value) {
    case "string":
      return boundedString(value, MAX_STRING, budget);
    case "number":
      return Number.isFinite(value) ? value : String(value);
    case "boolean":
      return value;
    case "bigint":
      return value.toString();
    case "object":
      return sanitizeObject(value, depth, budget);
    default:
      // undefined, functions and symbols have no JSON form: dropped.
      return undefined;
  }
}

function sanitizeObject(value: object, depth: number, budget: Budget): LogValue | undefined {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (value instanceof Error) return errorValue(value, budget);
  if (depth >= MAX_DEPTH) return TRUNCATED;
  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_ITEMS).map((item) => sanitizeValue(item, depth + 1, budget));
    return items.map((item) => item ?? null);
  }
  // A class instance (a Map, a stream) is named, never stringified: its own
  // toString() could be anything, including a throw.
  return isPlainObject(value)
    ? sanitizeEntries(value, depth, budget)
    : Object.prototype.toString.call(value);
}

function sanitizeEntries(
  value: Readonly<Record<string, unknown>>,
  depth: number,
  budget: Budget,
): LogData {
  const entries: [string, LogValue][] = [];
  for (const key of Object.keys(value).slice(0, MAX_KEYS)) {
    if (UNSAFE_KEYS.has(key)) continue;
    const item = isSecretName(key) ? REDACTED : sanitizeValue(value[key], depth + 1, budget);
    // A key is data too (a path, an id): it is redacted like a value.
    if (item !== undefined) entries.push([redactedHead(key, MAX_STRING), item]);
  }
  return Object.fromEntries(entries);
}

function errorValue(error: Error, budget: Budget): LogData {
  return {
    name: boundedString(error.name, MAX_STRING, budget),
    message: boundedString(error.message, MAX_STRING, budget),
    ...(error.stack !== undefined && { stack: boundedString(error.stack, MAX_STACK, budget) }),
  };
}

/** Redacted, clipped to `max`, and charged to the record's budget. */
function boundedString(text: string, max: number, budget: Budget): string {
  if (budget.chars <= 0) return TRUNCATED;
  const bounded = redactedHead(text, Math.min(max, budget.chars));
  budget.chars -= bounded.length;
  return bounded;
}

function isPlainObject(value: unknown): value is Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null) return false;
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}
