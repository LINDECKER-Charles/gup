import type { FieldReader } from "../../config/field-reader.js";
import { defineSection, type ConfigSectionDef } from "../../config/section.js";
import { MAX_PACKAGE_ID_LENGTH, packageIdProblem } from "../model/schedule-target.js";
import type {
  MonthDay,
  Recurrence,
  Schedule,
  ScheduleTarget,
  TimeOfDay,
  Weekday,
} from "../model/types.js";
import {
  MAX_NAME_LENGTH,
  MAX_SCHEDULES,
  MAX_TARGETS_PER_SCHEDULE,
} from "../model/validate-schedule.js";

/**
 * The schedules as stored in `schedules.json`, section `scheduler`, through
 * the settings store (atomic writes, re-read under a file lock before every
 * change, lenient reads). A schedule missing a required field, or holding a
 * malformed one, is dropped as a whole: half a schedule is never run.
 */

export interface SchedulesSection {
  readonly schedules: readonly Schedule[];
}

const ID_PATTERN = /^[0-9a-f]{8}$/;
/** `toISOString()` length; a hand-written date may be shorter. */
const ISO_MAX_LENGTH = 24;
const PROVIDER_ID = /^[A-Za-z0-9][A-Za-z0-9-]*$/;
const PROVIDER_ID_MAX_LENGTH = 64;
const EXPRESSION_MAX_LENGTH = 120;
const LABEL_MAX_LENGTH = 200;
const KINDS = ["daily", "weekly", "monthly", "cron"] as const;
/** Sentinel for an absent or out-of-range integer: never a valid hour, day or weekday. */
const INVALID = -1;

export const SCHEDULES_SECTION: ConfigSectionDef<SchedulesSection> = defineSection({
  key: "scheduler",
  version: 1,
  defaults: { schedules: [] },
  parse: (read) => ({
    schedules: read.objects("schedules", MAX_SCHEDULES).flatMap((entry) => {
      const parsed = parseSchedule(entry);
      return parsed ? [parsed] : [];
    }),
  }),
});

function parseSchedule(read: FieldReader): Schedule | null {
  const id = read.text("id", { maxLength: 8, pattern: ID_PATTERN });
  const name = read.text("name", { maxLength: MAX_NAME_LENGTH });
  const recurrence = parseRecurrence(read.object("recurrence"));
  const targets = read.objects("targets", MAX_TARGETS_PER_SCHEDULE).flatMap(parseTarget);
  const createdAt = isoText(read, "createdAt");
  const armedAt = isoText(read, "armedAt");
  if (!id || !name?.trim() || !recurrence || targets.length === 0) return null;
  if (!createdAt || !armedAt) return null;
  return {
    id,
    name,
    recurrence,
    targets,
    // An unattended action is off unless the file says otherwise.
    enabled: read.boolean("enabled", false),
    options: { catchUp: read.object("options").boolean("catchUp", true) },
    createdAt,
    armedAt,
  };
}

/** A date as an ISO instant (`toISOString()`), or undefined when absent or unparsable. */
function isoText(read: FieldReader, key: string): string | undefined {
  const text = read.text(key, { maxLength: ISO_MAX_LENGTH });
  const time = text === undefined ? Number.NaN : Date.parse(text);
  return Number.isNaN(time) ? undefined : new Date(time).toISOString();
}

function parseTarget(read: FieldReader): ScheduleTarget[] {
  const providerId = read.text("providerId", {
    maxLength: PROVIDER_ID_MAX_LENGTH,
    pattern: PROVIDER_ID,
  });
  const packageId = read.text("packageId", { maxLength: MAX_PACKAGE_ID_LENGTH });
  if (!providerId || packageId === undefined || packageIdProblem(packageId) !== null) return [];
  const label = read.text("label", { maxLength: LABEL_MAX_LENGTH });
  return [{ providerId, packageId, ...(label !== undefined && { label }) }];
}

function parseRecurrence(read: FieldReader): Recurrence | null {
  const kind = read.oneOf("kind", [...KINDS, ""] as const, "");
  if (kind === "cron") {
    const expression = read.text("expression", { maxLength: EXPRESSION_MAX_LENGTH });
    return expression?.trim() ? { kind, expression } : null;
  }
  const at = parseTime(read.object("at"));
  if (kind === "" || !at) return null;
  if (kind === "daily") return { kind, at };
  if (kind === "weekly") {
    const weekday = read.integer("weekday", { min: 0, max: 6 }, INVALID);
    return weekday === INVALID ? null : { kind, weekday: weekday as Weekday, at };
  }
  const day = parseMonthDay(read);
  return day === null ? null : { kind, day, at };
}

function parseTime(read: FieldReader): TimeOfDay | null {
  const hour = read.integer("hour", { min: 0, max: 23 }, INVALID);
  const minute = read.integer("minute", { min: 0, max: 59 }, INVALID);
  return hour === INVALID || minute === INVALID ? null : { hour, minute };
}

/** `"last"` or 1–28. */
function parseMonthDay(read: FieldReader): MonthDay | null {
  if (read.kindOf("day") === "string") {
    return read.text("day", { maxLength: 4, pattern: /^last$/ }) === undefined ? null : "last";
  }
  const day = read.integer("day", { min: 1, max: 28 }, INVALID);
  return day === INVALID ? null : day;
}
