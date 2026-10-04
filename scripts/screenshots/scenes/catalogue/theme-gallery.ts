import { VIEW_LABELS } from "../../../../src/ui/text/menu-labels.js";
import { THEME_LABELS } from "../../../../src/ui/text/settings/theme-labels.js";
import { THEME_IDS, type ThemeId } from "../../../../src/ui/theme/palette.js";
import { appFixture } from "../../fixtures/app-fixture.js";
import type { Scene, SceneGroup } from "../scene.js";
import { SCENE_SIZES } from "../sizes.js";
import { checkWingetAndPnpm } from "./package-plays.js";

/**
 * Themes left out of the gallery: `terminal` is the theme of every other
 * screenshot (`packages-select` is its gallery picture), and `auto` paints
 * `dark` or `light`, both in the gallery.
 */
const SHOWN_ELSEWHERE: ReadonlySet<ThemeId> = new Set(["terminal", "auto"]);

/** `theme`'s scene; its title and alt text name the theme as the app does when they are read. */
function themeScene(theme: ThemeId): Scene {
  return {
    id: `theme-${theme}`,
    get title() {
      return `gup — ${VIEW_LABELS.packages} · ${THEME_LABELS[theme]}`;
    },
    get alt() {
      return (
        `The Packages view in the ${THEME_LABELS[theme]} theme, with packages checked, the ` +
        "cursor row highlighted and the selection bar's button."
      );
    },
    size: SCENE_SIZES.default,
    fixture: () => appFixture({ settings: { theme: { id: theme } } }),
    play: checkWingetAndPnpm,
  };
}

/** The Packages view of `packages-select` in every other built-in theme, in the picker's order. */
export const THEME_GROUP: SceneGroup = {
  title: "Themes",
  scenes: THEME_IDS.filter((theme) => !SHOWN_ELSEWHERE.has(theme)).map(themeScene),
};
