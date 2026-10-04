import { activeLocale } from "./locale.js";

/**
 * A text — or a whole group of texts — in every language gup speaks. English
 * is the reference: its shape is the type, and every other language must
 * match it, key for key and parameter for parameter, or it does not compile.
 */
export interface Translations<T> {
  readonly en: T;
  readonly fr: NoInfer<T>;
}

/**
 * A catalog that answers in the active language on every read:
 * `MENU_LABELS.quit` is "Quit" or "Quitter", whichever the process speaks
 * when it is read. Same keys as the English catalog, each one a getter, so
 * spreading, `Object.keys` and `Object.entries` see the current language too.
 *
 * Read it where the text is shown, never into a module-level constant: see
 * `locale.ts`. `T` must be a plain object (a list goes under a key).
 */
export function localized<T extends object>(translations: Translations<T>): T {
  const view = {};
  for (const key of Object.keys(translations.en)) {
    Object.defineProperty(view, key, {
      enumerable: true,
      get: () => (translations[activeLocale()] as Readonly<Record<string, unknown>>)[key],
    });
  }
  return Object.freeze(view) as T;
}

/**
 * One text in the active language, read now: for a message built where it
 * is used, `localize({ en: "Python not found", fr: "Python introuvable" })`.
 */
export function localize<T>(translations: Translations<T>): T {
  return translations[activeLocale()];
}
