import {
  EDITOR_TITLES,
  SCHEDULES_LABEL,
} from "../../../../src/ui/text/schedule/schedule-menu-labels.js";
import { appFixture } from "../../fixtures/app-fixture.js";
import { SCHEDULES_FIXTURE } from "../../fixtures/schedules/schedule-data.js";
import type { SceneGroup, Stage } from "../scene.js";
import { SCENE_SIZES } from "../sizes.js";
import { SCAN_DONE } from "./package-plays.js";

const TITLE = `gup — ${SCHEDULES_LABEL}`;
/** The schedule the editor scene opens: the first of the list. */
const EDITED = SCHEDULES_FIXTURE[0]?.draft.name ?? "";

async function openSchedules(stage: Stage): Promise<void> {
  await stage.waitForText(SCAN_DONE);
  await stage.open("schedules");
  await stage.waitForText(EDITED);
}

/** Planification: the list with a failed run, and the editor with its next runs. */
export const SCHEDULE_GROUP: SceneGroup = {
  title: "Scheduled updates",
  scenes: [
    {
      id: "schedules",
      title: TITLE,
      alt:
        "Planification view: the Task Scheduler trigger active, three schedules with their " +
        "recurrence, package count, next and last run; the cursor on the one whose last run " +
        "failed, its per-package results below.",
      size: SCENE_SIZES.wide,
      fixture: () => appFixture(),
      play: async (stage) => {
        await openSchedules(stage);
        await stage.press("down", "down");
        await stage.waitForText("réseau indisponible");
      },
    },
    {
      id: "schedule-edit",
      title: TITLE,
      alt:
        "Schedule editor: name, a weekly recurrence on Monday at 09:00 with catch-up, the cron " +
        "expression and the next run times, and the three packages the schedule updates.",
      size: SCENE_SIZES.wide,
      fixture: () => appFixture(),
      play: async (stage) => {
        await openSchedules(stage);
        await stage.press("enter");
        await stage.waitForText(EDITOR_TITLES.edit(EDITED));
        await stage.waitForText("prochaines");
      },
    },
  ],
};
