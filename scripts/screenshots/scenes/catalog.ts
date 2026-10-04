import { JOURNAL_GROUP } from "./catalogue/journal-scenes.js";
import { MENU_GROUP } from "./catalogue/menu-scenes.js";
import { SCHEDULE_GROUP } from "./catalogue/schedule-scenes.js";
import { SETTINGS_GROUP } from "./catalogue/settings-scenes.js";
import { THEME_GROUP } from "./catalogue/theme-gallery.js";
import { UPDATE_GROUP } from "./catalogue/update-scenes.js";
import type { Scene, SceneGroup } from "./scene.js";

/** The gallery's sections, in the order a user meets the views. */
export const SCENE_GROUPS: readonly SceneGroup[] = [
  MENU_GROUP,
  UPDATE_GROUP,
  SCHEDULE_GROUP,
  JOURNAL_GROUP,
  SETTINGS_GROUP,
  THEME_GROUP,
];

/** Every screenshot, in gallery order. */
export const SCENES: readonly Scene[] = SCENE_GROUPS.flatMap((group) => group.scenes);
