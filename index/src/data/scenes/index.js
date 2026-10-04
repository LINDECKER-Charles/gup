/**
 * The terminal demo's tabs, in display order. Tab labels are copy
 * (`hero.terminal.tabs.<id>` in the catalogs); scenes are product truth, one
 * per interface language: a page shows the interface in its own language when
 * gup speaks it, in English otherwise (./interface-languages.js).
 */
import { APP_SCENES } from "./app-scene.js";
import { interfaceLanguageOf, perLanguage } from "./interface-languages.js";
import { JSON_SCENE } from "./json-scene.js";
import { UPDATE_SCENES } from "./update-scene.js";

export const SCENES = Object.freeze([
  { id: "app", scenes: APP_SCENES },
  { id: "update", scenes: UPDATE_SCENES },
  // Command output: the same in every language.
  { id: "json", scenes: perLanguage(() => JSON_SCENE) },
]);

/**
 * The scene tab `id` shows on a page in `localeId`.
 *
 * @param {string} id
 * @param {import("../../i18n/locales.js").LocaleId} localeId
 */
export function sceneOf(id, localeId) {
  return SCENES.find((entry) => entry.id === id).scenes[interfaceLanguageOf(localeId)];
}
