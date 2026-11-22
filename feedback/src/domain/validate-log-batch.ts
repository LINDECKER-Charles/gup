import { sha256 } from "../security/sha256.js";
import { canonicalJson } from "./canonical-json.js";
import { FieldReader } from "./field-reader.js";
import { FIELD_RULES } from "./field-rules.js";
import {
  JOURNAL_VOCABULARY,
  type ClientMeta, type HistoryItem, type JournalItem, type LogBatch, type LogItem,
} from "./journal.js";
import { readClientFacts } from "./read-client-facts.js";

/** Enough to locate the faults without echoing a thousand-line report. */
const MAX_REPORTED_FIELDS = 20;

export type BatchValidation =
  | { readonly ok: true; readonly value: LogBatch }
  | { readonly ok: false; readonly error: "invalid"; readonly fields: readonly string[] }
  | { readonly ok: false; readonly error: "too_large"; readonly message: string };

type ItemParser<T> = (reader: FieldReader, base: JournalItem) => T;

function tooLarge(message: string): BatchValidation {
  return { ok: false, error: "too_large", message };
}

/** The envelope every record shares (`v`, `ts`, `runId`), plus its dedupe hash. */
function readEnvelope(reader: FieldReader, item: unknown, json: string): JournalItem {
  reader.requiredInteger("v");
  return {
    hash: sha256(canonicalJson(item)).toString("hex"),
    ts: reader.requiredTimestamp("ts"),
    runId: reader.requiredText("runId", { min: 1, max: FIELD_RULES.runId.max }),
    json,
  };
}

const parseHistoryItem: ItemParser<HistoryItem> = (reader, base) => ({
  ...base,
  kind: reader.requiredChoice("kind", JOURNAL_VOCABULARY.historyKinds),
  status: reader.optionalText("status", FIELD_RULES.updateStatus),
});

const { logLevels } = JOURNAL_VOCABULARY;

const parseLogItem: ItemParser<LogItem> = (reader, base) => ({
  ...base,
  levelRank: logLevels.indexOf(reader.requiredChoice("level", logLevels)),
  event: reader.requiredText("event", FIELD_RULES.event),
});

const NUL = "\u0000";

function isRecord(value: unknown): boolean {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStorableText(text: string): boolean {
  return text.isWellFormed() && !text.includes(NUL);
}

/**
 * Whether every string and key of a parsed item is well-formed Unicode
 * without NUL: Postgres `jsonb` refuses both, so such an item would fail the
 * whole batch at insert time. The depth is bounded by the item size limit,
 * checked first.
 */
function isStorable(value: unknown): boolean {
  if (typeof value === "string") return isStorableText(value);
  if (typeof value !== "object" || value === null) return true;
  if (Array.isArray(value)) return value.every(isStorable);
  return Object.entries(value).every(([key, child]) => isStorableText(key) && isStorable(child));
}

interface ListScope {
  readonly name: "history" | "logs";
  readonly invalid: string[];
}

/** Parses one list; returns null when an item exceeds the per-item size limit. */
function parseItems<T>(items: readonly unknown[], scope: ListScope, parse: ItemParser<T>) {
  const parsed: T[] = [];
  for (const [index, item] of items.entries()) {
    const json = JSON.stringify(item) ?? "";
    if (Buffer.byteLength(json) > FIELD_RULES.batch.maxItemBytes) return null;
    const prefix = `${scope.name}[${index}].`;
    if (!isRecord(item) || !isStorable(item)) scope.invalid.push(`${scope.name}[${index}]`);
    const reader = new FieldReader(item, { prefix, sink: scope.invalid });
    parsed.push(parse(reader, readEnvelope(reader, item, json)));
  }
  return parsed;
}

function readList(body: Record<string, unknown>, name: string, invalid: string[]): unknown[] {
  const list = body[name] ?? [];
  if (Array.isArray(list)) return list;
  invalid.push(name);
  return [];
}

function readClientMeta(body: Record<string, unknown>, invalid: string[]): ClientMeta {
  const client = body["client"] ?? {};
  if (!isRecord(client)) invalid.push("client");
  const reader = new FieldReader(client, { prefix: "client.", sink: invalid });
  return {
    ...readClientFacts(reader),
    arch: reader.optionalText("arch", FIELD_RULES.arch),
    node: reader.optionalText("node", FIELD_RULES.node),
  };
}

/**
 * Checks an upload against the contract: the envelope of every record, the
 * item count and the size of each item. Records are kept as received — the
 * CLI redacted them before sending, and the back office shows them verbatim.
 */
export function validateLogBatch(raw: unknown): BatchValidation {
  if (!isRecord(raw)) return { ok: false, error: "invalid", fields: ["body"] };
  const body = raw as Record<string, unknown>;
  const invalid: string[] = body["schema"] === FIELD_RULES.batchSchema ? [] : ["schema"];
  const client = readClientMeta(body, invalid);
  const rawHistory = readList(body, "history", invalid);
  const rawLogs = readList(body, "logs", invalid);
  const { maxItems, maxItemBytes } = FIELD_RULES.batch;
  if (rawHistory.length + rawLogs.length > maxItems) {
    return tooLarge(`A batch holds at most ${maxItems} items.`);
  }
  const history = parseItems(rawHistory, { name: "history", invalid }, parseHistoryItem);
  const logs = parseItems(rawLogs, { name: "logs", invalid }, parseLogItem);
  if (history === null || logs === null) {
    return tooLarge(`An item holds at most ${maxItemBytes} bytes once serialised.`);
  }
  if (invalid.length > 0) {
    return { ok: false, error: "invalid", fields: invalid.slice(0, MAX_REPORTED_FIELDS) };
  }
  return { ok: true, value: { client, history, logs } };
}
