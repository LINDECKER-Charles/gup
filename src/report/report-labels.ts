import { localized } from "../core/i18n/localized.js";
import { DETAIL_TRANSLATIONS as DETAIL } from "./labels/detail-translations.js";
import { FRAME_TRANSLATIONS as FRAME } from "./labels/frame-translations.js";
import { OVERVIEW_TRANSLATIONS as OVERVIEW } from "./labels/overview-translations.js";
import { VOCABULARY_TRANSLATIONS as VOCABULARY } from "./labels/vocabulary-translations.js";

/**
 * Every word of the HTML report, in the interface's languages: the static
 * page and the client's texts. Plain data, embedded in the page as JSON in
 * the language active when the report is written — the client fills
 * `{name}` placeholders and picks `one`/`other` with the plural rules of the
 * report's Intl locale (`meta.locale`). Tests import it.
 *
 * One catalog, assembled from the topics under `labels/` (each holds both
 * languages side by side), so that the client reads every text by one path
 * (`units.packages`) whatever topic it belongs to.
 *
 * Lives beside the report rather than in `src/ui/text/`: these strings are
 * rendered by a browser, not a terminal, so the terminal glyph rules (and
 * their guard test) do not apply to them.
 */
export const REPORT_LABELS = localized({
  en: { ...FRAME.en, ...VOCABULARY.en, ...OVERVIEW.en, ...DETAIL.en },
  fr: { ...FRAME.fr, ...VOCABULARY.fr, ...OVERVIEW.fr, ...DETAIL.fr },
});
