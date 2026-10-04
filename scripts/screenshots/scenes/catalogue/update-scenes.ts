import { ELEVATE_DIALOG, RETRY_DIALOG, RUN_TITLES } from "../../../../src/ui/text/run-labels.js";
import { appFixture } from "../../fixtures/app-fixture.js";
import {
  POWERTOYS_PROGRESS,
  RUN_IN_FLIGHT,
  RUN_TO_THE_END,
} from "../../fixtures/update/run-scripts.js";
import type { SceneGroup, Stage } from "../scene.js";
import { SCENE_SIZES } from "../sizes.js";
import { runSix } from "./package-plays.js";

/** The run view's window title, read when a scene renders. */
function runTitle(): string {
  return `gup — ${RUN_TITLES.running}`;
}

/** The six packages run to the retry question: the elevation accepted on the way. */
async function toRetryOffer(stage: Stage): Promise<void> {
  await runSix(stage);
  await stage.waitForText(ELEVATE_DIALOG.title);
  await stage.press("enter");
  await stage.waitForText(RETRY_DIALOG.title);
}

/** An update run inside the app: in flight, the retry offer, the results. */
export const UPDATE_GROUP: SceneGroup = {
  title: "Updates",
  scenes: [
    {
      id: "update-running",
      get title() {
        return runTitle();
      },
      alt:
        "In-app update: three packages done, PowerToys downloading with winget's progress bar " +
        "in the embedded terminal pane below, 7-Zip queued and nodejs-lts waiting for the " +
        "administrator step.",
      size: SCENE_SIZES.wide,
      fixture: () => appFixture({ updates: RUN_IN_FLIGHT }),
      play: async (stage) => {
        await runSix(stage);
        await stage.waitForText(POWERTOYS_PROGRESS);
        // The frame clock is frozen: one tick shows how long PowerToys has been running.
        await stage.tick();
        await stage.waitForText("00:41");
      },
    },
    {
      id: "update-retry",
      get title() {
        return runTitle();
      },
      alt:
        "End of an in-app update: five packages updated, PowerToys failed, and gup offers to " +
        "retry it with a stronger strategy, the safe one first, or to leave the failure.",
      size: SCENE_SIZES.wide,
      fixture: () => appFixture({ updates: RUN_TO_THE_END }),
      play: toRetryOffer,
    },
    {
      id: "update-summary",
      get title() {
        return runTitle();
      },
      alt:
        "Results of an in-app update: five updated, one failure under the cursor, its " +
        "installer output kept in the pane below, and the key that writes the HTML report.",
      size: SCENE_SIZES.wide,
      fixture: () => appFixture({ updates: RUN_TO_THE_END }),
      play: async (stage) => {
        await toRetryOffer(stage);
        await stage.press("enter");
        await stage.waitForText(RUN_TITLES.done);
      },
    },
  ],
};
