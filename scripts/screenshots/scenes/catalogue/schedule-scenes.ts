import {
  PREVIEW_RUNS,
  toCron,
  upcomingRuns,
} from "../../../../src/core/scheduler/model/recurrence.js";
import { formatRelative } from "../../../../src/ui/text/format.js";
import {
  EDITOR_TEXT,
  EDITOR_TITLES,
} from "../../../../src/ui/text/schedule/schedule-editor-labels.js";
import { targetResultLabel } from "../../../../src/ui/text/schedule/schedule-labels.js";
import { SCHEDULE_MENU_LABELS } from "../../../../src/ui/text/schedule/schedule-menu-labels.js";
import { appFixture } from "../../fixtures/app-fixture.js";
import { FIXTURE_CLOCK } from "../../fixtures/clock.js";
import { SCHEDULES_FIXTURE, type FixtureSchedule } from "../../fixtures/schedules/schedule-data.js";
import type { SceneGroup, Stage } from "../scene.js";
import { SCENE_SIZES } from "../sizes.js";
import { SCAN_DONE } from "./package-plays.js";

/** The schedule the editor scene opens: the first of the list. */
const EDITED = scheduleOnRow(0);
/** The list scene's cursor row: the schedule whose last run failed. */
const FAILED_ROW = SCHEDULES_FIXTURE.findIndex(({ lastRun }) => lastRun.status === "failed");

/** The schedule on `row` of the list, which shows them in the order they were created. */
function scheduleOnRow(row: number): FixtureSchedule {
  const schedule = SCHEDULES_FIXTURE[row];
  if (!schedule) throw new Error(`the schedules fixture has nothing on row ${row}`);
  return schedule;
}

/** The Schedules view's window title, read when a scene renders. */
function schedulesTitle(): string {
  return `gup — ${SCHEDULE_MENU_LABELS.schedulesLabel}`;
}

/** What the details under the list say of a package of the failed run: "failed — <why>". */
function failureDetail(): string {
  const { targets } = scheduleOnRow(FAILED_ROW).lastRun;
  const failure = targets.find(({ status }) => status === "failed");
  if (!failure) throw new Error("the failed run of the schedules fixture has no failed package");
  return targetResultLabel(failure);
}

/** The editor's line under its fields: the edited schedule's cron and its next runs. */
function nextRunsPreview(): string {
  const { recurrence } = EDITED.draft;
  const { now } = FIXTURE_CLOCK;
  const runs = upcomingRuns(recurrence, now, PREVIEW_RUNS).map((at) => formatRelative(at, now));
  return EDITOR_TEXT.preview(toCron(recurrence), runs);
}

async function openSchedules(stage: Stage): Promise<void> {
  await stage.waitForText(SCAN_DONE);
  await stage.open("schedules");
  await stage.waitForText(EDITED.draft.name);
}

/** Schedules: the list with a failed run, and the editor with its next runs. */
export const SCHEDULE_GROUP: SceneGroup = {
  title: "Scheduled updates",
  scenes: [
    {
      id: "schedules",
      get title() {
        return schedulesTitle();
      },
      alt:
        "Schedules view: the Task Scheduler trigger active, three schedules with their " +
        "recurrence, package count, next and last run; the cursor on the one whose last run " +
        "failed, its per-package results below.",
      size: SCENE_SIZES.wide,
      fixture: () => appFixture(),
      play: async (stage) => {
        await openSchedules(stage);
        await stage.press(...Array.from({ length: FAILED_ROW }, () => "down"));
        await stage.waitForText(failureDetail());
      },
    },
    {
      id: "schedule-edit",
      get title() {
        return schedulesTitle();
      },
      alt:
        "Schedule editor: name, a weekly recurrence on Monday at 09:00 with catch-up, the cron " +
        "expression and the next run times, and the three packages the schedule updates.",
      size: SCENE_SIZES.wide,
      fixture: () => appFixture(),
      play: async (stage) => {
        await openSchedules(stage);
        await stage.press("enter");
        await stage.waitForText(EDITOR_TITLES.edit(EDITED.draft.name));
        await stage.waitForText(nextRunsPreview());
      },
    },
  ],
};
