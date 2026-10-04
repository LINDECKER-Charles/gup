import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ScreensRun } from "./output/screens-run.js";
import { SCENE_GROUPS, SCENES } from "./scenes/catalog.js";
import { catalogueProblems } from "./scenes/catalogue-problems.js";

/**
 * The screenshot generator (`npm run screenshots`, `npm run screenshots:check`).
 * One test per scene, so a scene that cannot reach its state fails alone and
 * the others still render; the gallery and the orphan sweep run last.
 */
const SCREENS_DIR = fileURLToPath(new URL("../../docs/assets/screens/", import.meta.url));
const MODE = process.env["SCREENSHOTS_MODE"] === "check" ? "check" : "write";
const run = new ScreensRun(SCREENS_DIR, MODE);
// Ids become file names: nothing is rendered or written from an invalid catalogue.
const problems = catalogueProblems(SCENES);
const isCatalogueBroken = problems.length > 0;

describe("screenshots", () => {
  it("catalogue", () => {
    expect(problems).toEqual([]);
  });

  for (const scene of SCENES) {
    it.skipIf(isCatalogueBroken)(scene.id, async () => {
      await run.scene(scene);
    });
  }

  it.skipIf(isCatalogueBroken)("gallery", async () => {
    await run.gallery(SCENE_GROUPS);
  });

  it.skipIf(isCatalogueBroken)("orphans", async () => {
    await run.orphans(SCENES);
  });
});
