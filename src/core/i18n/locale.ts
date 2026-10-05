/**
 * The languages gup speaks, and the one this process speaks.
 *
 * English is the default; French is the other language gup ships. The
 * command line chooses the locale once at startup (`main.ts`), before it
 * builds commander — the help and the usage errors are localized — from the
 * `GUP_LANG` variable, then the `interface.language` setting, then the
 * default (`commands/cli/language-module.ts`). The elevated child takes its
 * parent's, which travels in the batch payload.
 *
 * Text is read when it is shown, never captured while a module loads: the
 * modules are all evaluated before startup gets to choose, so a label read
 * at that point would stay in the default language for the whole run.
 */

export const LOCALES = ["en", "fr"] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

/**
 * Each language under its own name, the way a language picker lists them:
 * someone who cannot read the current interface still recognises theirs.
 */
export const LOCALE_NAMES: Readonly<Record<Locale, string>> = {
  en: "English",
  fr: "Français",
};

/**
 * The Intl locale behind each language, for numbers, dates, plurals and
 * sorting — explicit, never the machine's own.
 */
export const INTL_LOCALES = { en: "en-US", fr: "fr-FR" } as const satisfies Readonly<
  Record<Locale, string>
>;

export type IntlLocale = (typeof INTL_LOCALES)[Locale];

/** Everything a language tag may carry after its primary subtag: `fr-CA`, `fr_FR.UTF-8`, `fr@euro`. */
const SUBTAG_SEPARATOR = /[-_.@]/;

/** How many premature reads are kept for the startup guard test; one is enough to fail it. */
const MAX_RECORDED_READS = 20;
const PREMATURE_READ = "localized text read before startup chose the locale";

/**
 * The locale a user-supplied tag names, case-insensitively and on its
 * primary subtag only ("FR", "fr-CA", "fr_FR.UTF-8" are all French); null
 * for a tag gup has no translation for, or for anything that is not a string.
 */
export function parseLocale(value: unknown): Locale | null {
  if (typeof value !== "string") return null;
  const primary = value.trim().toLowerCase().split(SUBTAG_SEPARATOR, 1)[0];
  return LOCALES.find((locale) => locale === primary) ?? null;
}

let active: Locale = DEFAULT_LOCALE;
let isChosen = false;
const prematureReads: string[] = [];

/**
 * The language text is written in right now. Read by every localized
 * catalog on every access; cheap.
 *
 * A read before startup chose the locale is a label captured while its
 * module loads, which would stay in the default language: its stack is
 * recorded for the guard test (bounded, and only until the choice is made).
 */
export function activeLocale(): Locale {
  if (!isChosen && prematureReads.length < MAX_RECORDED_READS) {
    prematureReads.push(new Error(PREMATURE_READ).stack ?? "");
  }
  return active;
}

/** Speak `locale` from now on: startup's choice, the elevated child's, or a test's. */
export function setActiveLocale(locale: Locale): void {
  active = locale;
  isChosen = true;
}

/**
 * The stacks of the reads made before any locale was chosen, oldest first.
 * Exported for the guard test only (tests/core/i18n/startup-reads.test.ts),
 * which imports the whole command line and expects none.
 */
export function localeReadsBeforeStartup(): readonly string[] {
  return prematureReads;
}
