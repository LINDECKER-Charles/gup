import type { JournalItem } from "../export/shared-journals.js";
import type { ClientInfo } from "./client-info.js";
import type { StreamMark } from "./upload-cursor.js";

/**
 * The shared journals cut into the batches `POST /api/installs/{id}/logs`
 * accepts (`docs/development/feedback-service.md`): at most 1000 items each,
 * a body well under the service's 1 MiB, and no item over its 16 KiB — one
 * the service would refuse is left out rather than failing its whole batch.
 * Every key and string is made well-formed Unicode without NUL first: the
 * service's database stores neither a lone surrogate nor a NUL, a single
 * one would fail the batch (400), and a failed batch is dropped.
 * Items keep their order (oldest first), so a batch acknowledged moves the
 * upload cursor to the newest record of each stream it carried.
 */

export interface LogBatch {
  /** The request body, JSON text. */
  readonly body: string;
  readonly counts: { readonly history: number; readonly logs: number };
  /** The newest instant of each stream in the batch; absent for a stream it does not carry. */
  readonly newest: { readonly history?: StreamMark; readonly logs?: StreamMark };
}

const BATCH_SCHEMA = 1;
export const MAX_BATCH_ITEMS = 1000;
/** The service refuses an item serialised over this. */
const MAX_ITEM_BYTES = 16 * 1024;
/** Under the service's 1 MiB body limit, with room for the envelope. */
const MAX_BATCH_BYTES = 900 * 1024;
const NUL = "\u0000";

interface Draft {
  readonly history: string[];
  readonly logs: string[];
  bytes: number;
  newest: { history?: StreamMark; logs?: StreamMark };
}

export function buildLogBatches(items: readonly JournalItem[], client: ClientInfo): LogBatch[] {
  const batches: LogBatch[] = [];
  let draft = emptyDraft();
  for (const item of items) {
    const text = JSON.stringify(item.record, storable);
    const bytes = Buffer.byteLength(text, "utf8");
    if (bytes > MAX_ITEM_BYTES) continue;
    if (isFull(draft, bytes)) {
      batches.push(sealed(draft, client));
      draft = emptyDraft();
    }
    draft[item.stream].push(text);
    draft.bytes += bytes;
    draft.newest = { ...draft.newest, [item.stream]: advanced(draft.newest[item.stream], item) };
  }
  if (countOf(draft) > 0) batches.push(sealed(draft, client));
  return batches;
}

/** JSON.stringify replacer: every string and object key made storable. */
function storable(_key: string, value: unknown): unknown {
  if (typeof value === "string") return storableText(value);
  if (typeof value !== "object" || value === null || Array.isArray(value)) return value;
  const entries = Object.entries(value);
  if (entries.every(([key]) => storableText(key) === key)) return value;
  return Object.fromEntries(entries.map(([key, inner]) => [storableText(key), inner]));
}

/** Lone surrogates become U+FFFD (`toWellFormed`), NUL characters go. */
function storableText(text: string): string {
  return (text as string & WellFormable).toWellFormed().replaceAll(NUL, "");
}

/** ES2024's `String.prototype.toWellFormed`, which Node has and the ES2023 typings lack. */
interface WellFormable {
  toWellFormed(): string;
}

function advanced(mark: StreamMark | undefined, item: JournalItem): StreamMark {
  if (mark?.at !== item.ts) return { at: item.ts, count: 1 };
  return { at: mark.at, count: mark.count + 1 };
}

function emptyDraft(): Draft {
  return { history: [], logs: [], bytes: 0, newest: {} };
}

function countOf(draft: Draft): number {
  return draft.history.length + draft.logs.length;
}

function isFull(draft: Draft, nextBytes: number): boolean {
  return countOf(draft) >= MAX_BATCH_ITEMS || draft.bytes + nextBytes > MAX_BATCH_BYTES;
}

/** Items are serialised once: the body is assembled from their JSON text. */
function sealed(draft: Draft, client: ClientInfo): LogBatch {
  const body =
    `{"schema":${BATCH_SCHEMA},"client":${JSON.stringify(client)},` +
    `"history":[${draft.history.join(",")}],"logs":[${draft.logs.join(",")}]}`;
  return {
    body,
    counts: { history: draft.history.length, logs: draft.logs.length },
    newest: draft.newest,
  };
}
