import { afterEach, beforeEach } from "vitest";
import { setActiveLocale, type Locale } from "../../src/core/i18n/locale.js";

/**
 * The language every suite speaks unless it asks for another: French, the
 * language the interface had alone until 0.5.1, in which the suites written
 * before it assert their texts. Set by worker-setup.ts for the suites, and
 * by test-env.ts (`GUP_LANG`) for the CLI they spawn.
 */
export const SUITE_LOCALE: Locale = "fr";

/** Every test of the enclosing `describe` speaks `locale`; the suite's language comes back after. */
export function useLocale(locale: Locale): void {
  beforeEach(() => setActiveLocale(locale));
  afterEach(() => setActiveLocale(SUITE_LOCALE));
}
