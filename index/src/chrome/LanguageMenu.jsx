/**
 * The header's language switcher: a native <details> disclosure listing every
 * locale by endonym (speaker-ranking order, the current one marked), so it
 * opens, closes and navigates without JavaScript. Script adds Escape and
 * outside-click dismissal, and the fragment carry-over of LocaleLink.
 *
 * Endonyms only: per-locale translated language names would come from
 * Intl.DisplayNames, whose output depends on the ICU build and would break
 * hydration for a cosmetic gain.
 */
import { useRef } from "react";
import { LOCALES } from "../i18n/locales.js";
import { useI18n } from "../i18n/use-i18n.js";
import { useDetailsDismiss } from "../lib/use-details-dismiss.js";
import { Icon } from "../ui/Icon.jsx";
import { LocaleLink } from "./LocaleLink.jsx";

export function LanguageMenu() {
  const { locale, messages } = useI18n();
  const menu = useRef(null);
  useDetailsDismiss(menu);

  return (
    <details className="lang" ref={menu}>
      <summary className="lang-summary" aria-label={messages.common.languageCurrent}>
        <Icon name="globe" />
        <span className="lang-current">{locale.endonym}</span>
        <Icon name="chevron" size={14} className="lang-chevron" />
      </summary>
      <ul className="lang-list" aria-label={messages.common.language}>
        {LOCALES.map((target) => (
          <li key={target.id}>
            <LocaleLink target={target} isCurrent={target.id === locale.id} hasCheck />
          </li>
        ))}
      </ul>
    </details>
  );
}
