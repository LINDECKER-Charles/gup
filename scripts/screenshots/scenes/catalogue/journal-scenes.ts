import { HEATMAP_LABELS, SLOWEST_LABELS } from "../../../../src/ui/text/journal/activity-labels.js";
import {
  DEBUG_LABELS,
  EVENT_LABELS,
  JOURNAL_LABELS,
  RECURRENCE_LABELS,
} from "../../../../src/ui/text/journal/journal-labels.js";
import { appFixture } from "../../fixtures/app-fixture.js";
import type { SceneGroup, Stage } from "../scene.js";
import { SCENE_SIZES } from "../sizes.js";
import { SCAN_DONE } from "./package-plays.js";

const TITLE = `gup — ${JOURNAL_LABELS.view}`;

/** The Journal on tab `key` (1 to 4), once `ready` is on screen. */
function onTab(key: string, ready: string): (stage: Stage) => Promise<void> {
  return async (stage) => {
    await stage.waitForText(SCAN_DONE);
    await stage.open("journal");
    // The Activité tab is drawn once the history is read: the other tabs have their data too.
    await stage.waitForText(SLOWEST_LABELS.title);
    await stage.press(key);
    await stage.waitForText(ready);
  };
}

/** The Journal's four tabs over the fixture machine's year of history. */
export const JOURNAL_GROUP: SceneGroup = {
  title: "Journal",
  scenes: [
    {
      id: "journal-activity",
      title: TITLE,
      alt:
        "Journal, Activité tab: a year of updates as a calendar heatmap, the headline figures " +
        "(updates, success rate, failures, scans), the outdated-package trend and the slowest " +
        "provider scans.",
      size: SCENE_SIZES.wide,
      fixture: () => appFixture(),
      play: onTab("1", HEATMAP_LABELS.title),
    },
    {
      id: "journal-recurrence",
      title: TITLE,
      alt:
        "Journal, Récurrence tab: the packages updated most often, a bar for each with its " +
        "update count, typical interval and cadence.",
      size: SCENE_SIZES.wide,
      fixture: () => appFixture(),
      play: onTab("2", RECURRENCE_LABELS.title),
    },
    {
      id: "journal-events",
      title: TITLE,
      alt:
        "Journal, Événements tab: every scan and update attempt, newest first, with its " +
        "outcome, provider, package, versions and duration; scheduled runs among them.",
      size: SCENE_SIZES.wide,
      fixture: () => appFixture(),
      play: onTab("3", EVENT_LABELS.type(EVENT_LABELS.types.all)),
    },
    {
      id: "journal-debug",
      title: TITLE,
      alt:
        "Journal, Debug tab: the latest debug-log records with their time, level and event, " +
        "a provider's failed scan as a warning, and the key that builds a diagnostic archive.",
      size: SCENE_SIZES.wide,
      fixture: () => appFixture(),
      play: onTab("4", DEBUG_LABELS.level(DEBUG_LABELS.levels.all)),
    },
  ],
};
