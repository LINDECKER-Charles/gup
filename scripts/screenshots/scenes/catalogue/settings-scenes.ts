import { VIEW_LABELS } from "../../../../src/ui/text/menu-labels.js";
import { JOURNAL_OPTION_LABELS } from "../../../../src/ui/text/settings/journal-options-labels.js";
import { COLOR_EDITOR } from "../../../../src/ui/text/settings/color-editor-labels.js";
import { OPTION_LABELS } from "../../../../src/ui/text/settings/options-labels.js";
import { THEME_LABELS, THEME_PICKER } from "../../../../src/ui/text/settings/theme-labels.js";
import { THEME_IDS, type ThemeId } from "../../../../src/ui/theme/palette.js";
import { appFixture } from "../../fixtures/app-fixture.js";
import type { SceneGroup, Stage } from "../scene.js";
import { SCENE_SIZES } from "../sizes.js";
import { SCAN_DONE } from "./package-plays.js";

/** Rows of the Options list from the top: Fast mode, Install timeout, Provider filter, Theme… */
const THEME_ROW = 3;
const COLORS_ROW = 4;
/**
 * Debug log, JOURNAL's first row: after SCAN & INSTALL (3 rows), APPEARANCE (5)
 * and BEHAVIOR (11, Language first).
 */
const LOG_LEVEL_ROW = 19;
/** How the Options list marks the row under its cursor. */
const CURSOR_MARK = "› ";
/** The theme the picker previews in the screenshot: the whole app repainted with it. */
const PREVIEWED: ThemeId = "dracula";
/** An accent too dark to read on the terminal's background: gup adjusts it, and says so. */
const UNREADABLE_CUSTOMS = { terminal: { accent: "#1f4e5a" } } as const;

/** The Options view's window title, read when a scene renders. */
function optionsTitle(): string {
  return `gup — ${VIEW_LABELS.options}`;
}

/** Options, with the cursor on the row `row` lines from the top. */
async function moveToOptionRow(stage: Stage, row: number): Promise<void> {
  await stage.waitForText(SCAN_DONE);
  await stage.open("options");
  await stage.waitForText(OPTION_LABELS.fast);
  await stage.press(...Array.from({ length: row }, () => "down"));
}

/** Options, then Enter on the row `row` lines from the top. */
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
      get title() {
        return optionsTitle();
      },
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
        await stage.waitForText(THEME_PICKER.previewFact);
      },
    },
    {
      id: "options-colors",
      get title() {
        return optionsTitle();
      },
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
      get title() {
        return optionsTitle();
      },
      alt:
        "Options, JOURNAL section: the debug log's level under the cursor, the period the " +
        "Journal opens on and whether the HTML report opens in the browser; the file row " +
        "reads disabled, as screenshots use no settings file.",
      size: SCENE_SIZES.default,
      fixture: () => appFixture(),
      play: async (stage) => {
        await moveToOptionRow(stage, LOG_LEVEL_ROW);
        // A hint that fits stands beside its row whatever the cursor: the mark tells the row.
        await stage.waitForText(`${CURSOR_MARK}${JOURNAL_OPTION_LABELS.logLevel}`);
      },
    },
  ],
};
