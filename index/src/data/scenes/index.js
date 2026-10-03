/**
 * The terminal demo's tabs, in display order. Tab labels are copy
 * (`hero.terminal.tabs.<id>` in the catalogs); scenes are product truth.
 */
import { APP_SCENE } from "./app-scene.js";
import { JSON_SCENE } from "./json-scene.js";
import { UPDATE_SCENE } from "./update-scene.js";

export const SCENES = Object.freeze([
  { id: "app", scene: APP_SCENE },
  { id: "update", scene: UPDATE_SCENE },
  { id: "json", scene: JSON_SCENE },
]);
