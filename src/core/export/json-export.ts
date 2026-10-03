import type { HistoryReadStats } from "../history/reader.js";
import type { HistoryEvent, ScanEvent, UpdateEvent } from "../history/types.js";
import type { Insights } from "../insights/types.js";
import { redactText } from "../log/redact.js";
import type { Period } from "../time/period.js";

/**
 * The history of a period as one JSON document — what it was read from, the
 * insights, every event — for a script or another tool. Field names are
 * English snake_case: a data schema, stable across interface languages,
 * versioned by {@link JSON_EXPORT_SCHEMA}.
 *
 * Free text (package ids, versions, messages, scan errors) is redacted again
 * on the way out: secrets, and the home directory shortened to `~`.
 */

export const JSON_EXPORT_SCHEMA = "gup.history-export/1";

export interface ExportMeta {
  readonly generatedAt: Date;
  readonly gup: string;
  readonly platform: string;
  readonly timeZone: string;
  readonly period: Period;
  readonly stats: HistoryReadStats;
}

export interface JsonExportInput {
  readonly meta: ExportMeta;
  readonly insights: Insights;
  readonly events: readonly HistoryEvent[];
}

const INDENT = 2;
const UPPERCASE = /[A-Z]/g;

export function toJsonExport({ meta, insights, events }: JsonExportInput): string {
  const document = {
    schema: JSON_EXPORT_SCHEMA,
    meta: snakeCaseKeys({
      generatedAt: meta.generatedAt.toISOString(),
      gup: meta.gup,
      platform: meta.platform,
      timeZone: meta.timeZone,
      period: periodOf(meta.period),
      stats: meta.stats,
    }),
    insights: insightsDocument(insights),
    events: events.map((event) => snakeCaseKeys(redactedEvent(event))),
  };
  return `${JSON.stringify(document, null, INDENT)}\n`;
}

/**
 * The insights as plain JSON data — snake_case keys, every string redacted,
 * the period left to the caller's metadata. Shared with the diagnostic
 * archive's activity summary.
 */
export function insightsDocument(insights: Insights): unknown {
  const { period: _period, ...summary } = insights;
  return snakeCaseKeys(redactStrings(summary));
}

function periodOf(period: Period): object {
  return {
    key: period.key,
    since: period.since?.toISOString() ?? null,
    until: period.until.toISOString(),
  };
}

function redactedEvent(event: HistoryEvent): HistoryEvent {
  return event.kind === "update" ? redactedUpdate(event) : redactedScan(event);
}

function redactedUpdate(event: UpdateEvent): UpdateEvent {
  const { packageId, from, to, message, retry } = event;
  return {
    ...event,
    packageId: redactText(packageId),
    ...(from !== undefined && { from: redactText(from) }),
    ...(to !== undefined && { to: redactText(to) }),
    ...(message !== undefined && { message: redactText(message) }),
    ...(retry !== undefined && { retry: redactText(retry) }),
  };
}

function redactedScan(event: ScanEvent): ScanEvent {
  return {
    ...event,
    providers: event.providers.map((provider) =>
      provider.error === undefined ? provider : { ...provider, error: redactText(provider.error) },
    ),
  };
}

/** Every string of a JSON-shaped value through `redactText`, structure untouched. */
function redactStrings(value: unknown): unknown {
  if (typeof value === "string") return redactText(value);
  if (Array.isArray(value)) return value.map(redactStrings);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redactStrings(item)]));
}

/** `providerId` → `provider_id`, at every depth of a JSON-shaped value. */
function snakeCaseKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(snakeCaseKeys);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key.replace(UPPERCASE, (letter) => `_${letter.toLowerCase()}`),
      snakeCaseKeys(item),
    ]),
  );
}
