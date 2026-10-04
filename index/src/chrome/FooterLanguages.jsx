/**
 * Every locale, by endonym, at the foot of every page: a plain crawlable
 * link list that also serves readers who never open the header menu.
 */
import { LOCALES } from "../i18n/locales.js";
import { useI18n } from "../i18n/use-i18n.js";
import { LocaleLink } from "./LocaleLink.jsx";

export function FooterLanguages() {
  const { locale, messages } = useI18n();

  return (
    <nav className="foot-languages" aria-labelledby="foot-languages">
      <h2 className="foot-title" id="foot-languages">
        {messages.footer.languages}
      </h2>
      <ul className="foot-language-list">
        {LOCALES.map((target) => (
          <li key={target.id}>
            <LocaleLink target={target} isCurrent={target.id === locale.id} />
          </li>
        ))}
      </ul>
    </nav>
  );
}
