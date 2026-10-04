import {
  HISTORY_SCHEMA_VERSION,
  type HistoryEnvelope,
} from "../../../../src/core/history/types.js";
import type { RunTrigger } from "../../../../src/core/state/run-context.js";
import { gupVersion } from "../../../../src/core/version.js";
import { FIXTURE_PLATFORM } from "../machine.js";
import { localDayKey, type FixtureDay } from "./fixture-days.js";

/** The gup process a record comes from: its id and what started it. */
export interface Session {
  readonly runId: string;
  readonly trigger: RunTrigger;
}

/** One session in this many is a `gup update` on the command line, the others the menu. */
const COMMAND_LINE_EVERY = 4;

/**
 * The user's session of `day`: one gup run per day. Its id starts with the
 * date, the part the Journal shows (a real id is a random UUID).
 */
export function sessionOf(day: FixtureDay): Session {
  return {
    runId: `${day.key}-fixture`,
    trigger: day.index % COMMAND_LINE_EVERY === 0 ? "cli" : "menu",
  };
}

/** The headless gup the OS trigger started at `startedAt` for schedule `scheduleId`. */
export function scheduledSession(startedAt: Date, scheduleId: string): Session {
  return { runId: `${localDayKey(startedAt)}-tick-${scheduleId}`, trigger: "schedule" };
}

/** The fields every history record of `session` carries, at instant `at`. */
export function envelope(at: Date, session: Session): Omit<HistoryEnvelope, "kind"> {
  return {
    v: HISTORY_SCHEMA_VERSION,
    ts: at.toISOString(),
    runId: session.runId,
    gup: gupVersion(),
    platform: FIXTURE_PLATFORM,
    trigger: session.trigger,
  };
}
