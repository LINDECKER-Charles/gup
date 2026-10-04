import { DEFAULT_LOCALE, parseLocale, type Locale } from "./locale.js";

/**
 * Which language this run speaks, and why. Pure: the command line resolves
 * it once at startup, `gup language` and `gup doctor` again to say where it
 * comes from.
 *
 * Precedence: `GUP_LANG` > the `interface.language` setting > English. A
 * `GUP_LANG` gup has no translation for is ignored (and reported by
 * `gup language` and `gup doctor`) rather than failing every command. The
 * machine's own locale (`LANG`, the OS display language) is deliberately not
 * consulted: English stays the default until the user picks another.
 */

export type LocaleSource = "env" | "setting" | "default";

export interface LocaleChoice {
  readonly locale: Locale;
  readonly source: LocaleSource;
  /** `GUP_LANG` when it named a language gup does not speak. */
  readonly ignoredEnv?: string;
}

export interface LocaleChoiceInput {
  readonly env: NodeJS.ProcessEnv;
  /** The setting, asked for only when `GUP_LANG` does not decide; absent where settings are never read. */
  readonly setting?: () => Locale;
}

export const LANGUAGE_ENV = "GUP_LANG";

export function resolveLocale({ env, setting }: LocaleChoiceInput): LocaleChoice {
  const raw = env[LANGUAGE_ENV]?.trim();
  const fromEnv = parseLocale(raw);
  if (fromEnv !== null) return { locale: fromEnv, source: "env" };
  const ignored = raw ? { ignoredEnv: raw } : {};
  const saved = setting?.() ?? DEFAULT_LOCALE;
  // The settings file keeps only what differs from the default: English
  // saved and English never chosen are the same choice.
  if (saved === DEFAULT_LOCALE) return { locale: DEFAULT_LOCALE, source: "default", ...ignored };
  return { locale: saved, source: "setting", ...ignored };
}
