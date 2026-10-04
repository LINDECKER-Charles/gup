import { VIEW_LABELS } from "../../../../src/ui/text/menu-labels.js";
import { JOURNAL_OPTION_HINTS } from "../../../../src/ui/text/settings/journal-options-labels.js";
import {
  COLOR_EDITOR,
  PREVIEW_FACT,
  THEME_LABELS,
} from "../../../../src/ui/text/settings/theme-labels.js";
import { THEME_IDS, type ThemeId } from "../../../../src/ui/theme/palette.js";
import { appFixture } from "../../fixtures/app-fixture.js";
import type { SceneGroup, Stage } from "../scene.js";
import { SCENE_SIZES } from "../sizes.js";
import { SCAN_DONE } from "./package-plays.js";

const TITLE = `gup — ${VIEW_LABELS.options}`;
/** Rows of the Options list from the top: Mode rapide, Timeout, Filtre, Thème, Couleurs. */
const THEME_ROW = 3;
const COLORS_ROW = 4;
/** Journal de debug, JOURNAL's first row: after SCAN (3 rows), APPARENCE (5) and CONFORT (10). */
const LOG_LEVEL_ROW = 18;
/** The theme the picker previews in the screenshot: the whole app repainted with it. */
const PREVIEWED: ThemeId = "dracula";
/** An accent too dark to read on the terminal's background: gup adjusts it, and says so. */
const UNREADABLE_CUSTOMS = { terminal: { accent: "#1f4e5a" } } as const;

/** Options, with the cursor on the row `row` lines from the top. */
async function moveToOptionRow(stage: Stage, row: number): Promise<void> {
  await stage.waitForText(SCAN_DONE);
  await stage.open("options");
  await stage.waitForText("Mode rapide");
  await stage.press(...Array.from({ length: row }, () => "down"));
}

/** Options, then Entrée on the row `row` lines from the top. */
async function openOptionRow(stage: Stage, row: number): Promise<void> {
  await moveToOptionRow(stage, row);
  await stage.press("enter");
}

/**
 * Options: the theme picker previewing a theme, the colour editor's contrast
 * check, and the JOURNAL section.
 */
export const SETTINGS_GROUP: SceneGroup = {
  title: "Options",
  scenes: [
    {
      id: "options-themes",
      title: TITLE,
      alt:
        "Options, theme picker: every built-in theme with its lowest contrast ratio, the " +
        "Dracula theme under the cursor previewed on the whole app, its sample and contrast " +
        "verdict on the right.",
      size: SCENE_SIZES.default,
      fixture: () => appFixture(),
      play: async (stage) => {
        await openOptionRow(stage, THEME_ROW);
        await stage.waitForText(THEME_LABELS[PREVIEWED]);
        const fromSaved = THEME_IDS.indexOf(PREVIEWED) - THEME_IDS.indexOf("terminal");
        await stage.press(...Array.from({ length: fromSaved }, () => "down"));
        await stage.waitForText(PREVIEW_FACT);
      },
    },
    {
      id: "options-colors",
      title: TITLE,
      alt:
        "Options, colour editor: each colour role with the chosen and displayed colour, its " +
        "contrast ratio and a sample; a custom accent too dark to read raised from 1.4:1 to " +
        "4.5:1, with a warning.",
      size: SCENE_SIZES.default,
      fixture: () => appFixture({ settings: { theme: { custom: UNREADABLE_CUSTOMS } } }),
      play: async (stage) => {
        await openOptionRow(stage, COLORS_ROW);
        await stage.waitForText(COLOR_EDITOR.base(THEME_LABELS.terminal));
      },
    },
    {
      id: "options-journal",
      title: TITLE,
      alt:
        "Options, JOURNAL section: the debug log's level under the cursor, the period the " +
        "Journal opens on and whether the HTML report opens in the browser; the file row " +
        "reads désactivé, as screenshots use no settings file.",
      size: SCENE_SIZES.default,
      fixture: () => appFixture(),
      play: async (stage) => {
        await moveToOptionRow(stage, LOG_LEVEL_ROW);
        await stage.waitForText(JOURNAL_OPTION_HINTS.logLevel);
      },
    },
  ],
};
