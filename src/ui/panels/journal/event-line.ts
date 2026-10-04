import type {
  HistoryEvent,
  ScanEvent,
  ScanProviderRecord,
  UpdateEvent,
  UpdateStatus,
} from "../../../core/history/types.js";
import type { ProviderName } from "../../charts/activity-sections.js";
import { STATUS_GLYPHS } from "../../theme/glyphs.js";
import { formatDateTime, formatDuration, formatRelative } from "../../text/fr-format.js";
import { EVENT_LABELS, TRIGGER_LABELS } from "../../text/journal/journal-labels.js";
import { UPDATE_STATUS_LABELS } from "../../text/journal/log-labels.js";
import { fit, seg, type Line, type Segment, type Tone } from "../../tui/styled-lines.js";
import { fieldLines, textBlock, type DetailField } from "./detail-lines.js";

/**
 * One history event as a row of the Événements tab — when, what happened
 * (always a mark and a word, never a colour alone), where, which versions,
 * how long — and as the detail Entrée opens.
 */

export interface EventDetail {
  readonly title: Line;
  readonly body: Line[];
}

export interface DetailContext {
  readonly width: number;
  readonly now: Date;
  /** A provider's display name from its id, as every other view names it. */
  readonly providerName: ProviderName;
  /** A schedule's name from its id; without it, or for an id it does not know, the id shows. */
  readonly scheduleName?: ((scheduleId: string) => string | undefined) | undefined;
}

interface Columns {
  readonly provider: number;
  readonly versions: number;
}

const DATE_WIDTH = 11;
const STATUS_WIDTH = 10;
const DURATION_WIDTH = 8;
const FIXED_WIDTH = DATE_WIDTH + 2 + STATUS_WIDTH + DURATION_WIDTH;
const WIDE_PROVIDER = 12;
const NARROW_PROVIDER = 10;
const VERSIONS_WIDTH = 21;
/** Room the middle needs for the provider and versions columns, then for the provider alone. */
const WITH_VERSIONS = 52;
const WITH_PROVIDER = 24;
const SESSION_ID_LENGTH = 8;

interface StatusLook {
  readonly mark: string;
  readonly tone: Tone;
}

const STATUS_LOOK: Readonly<Record<UpdateStatus, StatusLook>> = {
  success: { mark: STATUS_GLYPHS.success, tone: "success" },
  failed: { mark: STATUS_GLYPHS.failed, tone: "danger" },
  skipped: { mark: STATUS_GLYPHS.skipped, tone: "warning" },
};

export function eventRow(event: HistoryEvent, width: number, providerName: ProviderName): Line {
  const middle = Math.max(0, width - FIXED_WIDTH);
  const date = seg(`${formatDateTime(new Date(event.ts))}  `, "muted");
  const duration = seg(durationOf(event.durationMs).padStart(DURATION_WIDTH), "muted");
  if (event.kind === "scan") {
    const summary = EVENT_LABELS.scanSummary(event.providers.length, event.outdated);
    const status = seg(fit(`${STATUS_GLYPHS.scan} ${EVENT_LABELS.scan}`, STATUS_WIDTH), "accent");
    return [date, status, seg(fit(summary, middle)), duration];
  }
  const look = STATUS_LOOK[event.status];
  const word = `${look.mark} ${UPDATE_STATUS_LABELS[event.status]}`;
  const status = seg(fit(word, STATUS_WIDTH), look.tone);
  const subject = { provider: providerName(event.providerId), columns: columnsFor(middle), middle };
  return [date, status, ...subjectCells(event, subject), duration];
}

/** The detail of an event: its title, then its fields and any message. */
export function eventDetail(event: HistoryEvent, context: DetailContext): EventDetail {
  return event.kind === "scan" ? scanDetail(event, context) : updateDetail(event, context);
}

/** The text `/` matches an event against: a provider by its name or its id. */
export function eventSearchText(event: HistoryEvent, providerName: ProviderName): string {
  const named = (providerId: string) => [providerName(providerId), providerId];
  if (event.kind === "scan") {
    const providers = event.providers.flatMap((provider) => named(provider.providerId));
    return [EVENT_LABELS.scan, ...providers].join(" ");
  }
  const { providerId, packageId, status, message } = event;
  return [...named(providerId), packageId, UPDATE_STATUS_LABELS[status], message ?? ""].join(" ");
}

function columnsFor(middle: number): Columns {
  if (middle >= WITH_VERSIONS) return { provider: WIDE_PROVIDER, versions: VERSIONS_WIDTH };
  if (middle >= WITH_PROVIDER) return { provider: NARROW_PROVIDER, versions: 0 };
  return { provider: 0, versions: 0 };
}

/** The provider's name, the columns that fit, and the room between the status and the duration. */
interface Subject {
  readonly provider: string;
  readonly columns: Columns;
  readonly middle: number;
}

function subjectCells(event: UpdateEvent, { provider, columns, middle }: Subject): Segment[] {
  const name = middle - (columns.provider > 0 ? columns.provider + 1 : 0) - columns.versions;
  const cells: Segment[] = [];
  if (columns.provider > 0) cells.push(seg(`${fit(provider, columns.provider)} `, "muted"));
  cells.push(seg(fit(event.packageId, Math.max(0, name)), "strong"));
  if (columns.versions > 0) {
    cells.push(seg(fit(` ${versionsOf(event)}`, columns.versions), "muted"));
  }
  return cells;
}

function updateDetail(event: UpdateEvent, context: DetailContext): EventDetail {
  const { width, now, scheduleName, providerName } = context;
  const look = STATUS_LOOK[event.status];
  const hasVersions = event.from !== undefined || event.to !== undefined;
  const fields: DetailField[] = [
    [EVENT_LABELS.date, formatRelative(new Date(event.ts), now)],
    [EVENT_LABELS.status, `${look.mark} ${UPDATE_STATUS_LABELS[event.status]}`],
    [EVENT_LABELS.versions, hasVersions ? versionsOf(event) : undefined],
    [EVENT_LABELS.duration, optionalDuration(event.durationMs)],
    [EVENT_LABELS.retry, event.retry],
    [EVENT_LABELS.elevated, event.elevated ? EVENT_LABELS.yes : undefined],
    [EVENT_LABELS.schedule, scheduleOf(event.scheduleId, scheduleName)],
    ...sessionFields(event),
  ];
  const message = event.message ? textBlock(EVENT_LABELS.message, event.message, width) : [];
  const subject = `${EVENT_LABELS.update} · ${providerName(event.providerId)} · `;
  return {
    title: [seg(subject, "muted"), seg(event.packageId, "strong")],
    body: [...fieldLines(fields, width), ...(message.length > 0 ? [[], ...message] : [])],
  };
}

function scanDetail(event: ScanEvent, { width, now, providerName }: DetailContext): EventDetail {
  const fields: DetailField[] = [
    [EVENT_LABELS.date, formatRelative(new Date(event.ts), now)],
    [EVENT_LABELS.duration, formatDuration(event.durationMs)],
    [EVENT_LABELS.mode, event.fast ? EVENT_LABELS.fast : EVENT_LABELS.full],
    [EVENT_LABELS.filter, event.filter.join(", ") || EVENT_LABELS.allProviders],
    ...sessionFields(event),
  ];
  const byOutdated = [...event.providers].sort((a, b) => b.outdated - a.outdated);
  const providers = byOutdated.map(
    (provider): DetailField => [providerName(provider.providerId), providerResult(provider)],
  );
  const summary = EVENT_LABELS.scanSummary(event.providers.length, event.outdated);
  return {
    title: [seg(`${STATUS_GLYPHS.scan} `, "accent"), seg(summary, "strong")],
    body: [
      ...fieldLines(fields, width),
      [],
      [seg(EVENT_LABELS.providers, "strong")],
      ...fieldLines(providers, width),
    ],
  };
}

/** "20 en retard · 12,4 s", or the provider's scan error. */
function providerResult(provider: ScanProviderRecord): string {
  if (provider.error !== undefined) return EVENT_LABELS.providerError(provider.error);
  const duration = optionalDuration(provider.durationMs);
  return [EVENT_LABELS.outdated(provider.outdated), ...(duration ? [duration] : [])].join(" · ");
}

function sessionFields(event: HistoryEvent): DetailField[] {
  return [
    [EVENT_LABELS.trigger, event.trigger === undefined ? undefined : TRIGGER_LABELS[event.trigger]],
    [EVENT_LABELS.session, event.runId.slice(0, SESSION_ID_LENGTH)],
  ];
}

/**
 * The schedule an update ran for, by its name. One the lookup does not know
 * (deleted since, or the schedules unreadable) keeps its id.
 */
function scheduleOf(
  scheduleId: string | undefined,
  nameOf: DetailContext["scheduleName"],
): string | undefined {
  if (scheduleId === undefined) return undefined;
  return nameOf?.(scheduleId) ?? scheduleId;
}

function versionsOf(event: UpdateEvent): string {
  return `${event.from ?? "?"} → ${event.to ?? "?"}`;
}

function optionalDuration(ms: number | undefined): string | undefined {
  return ms === undefined ? undefined : formatDuration(ms);
}

function durationOf(ms: number | undefined): string {
  return optionalDuration(ms) ?? "";
}
