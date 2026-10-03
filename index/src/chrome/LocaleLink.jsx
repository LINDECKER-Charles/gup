/**
 * A link to one locale's home, labelled by its endonym in its own language
 * and direction. On click the current fragment is carried over, so a reader
 * on /gup/#faq switching to French lands on /gup/fr/#faq.
 *
 * `lang` and `dir` sit on the endonym, not on the link: the name is spoken
 * and laid out in its own language, while the link box follows the page —
 * on the link, `dir` would push "العربية" to the far edge of every
 * left-to-right menu, and every other name to the far edge of the Arabic one.
 */
import { localeHref } from "../i18n/locale-href.js";
import { Icon } from "../ui/Icon.jsx";

/**
 * @param {{ target: import("../i18n/locales.js").Locale, isCurrent: boolean,
 *   hasCheck?: boolean }} props
 */
export function LocaleLink({ target, isCurrent, hasCheck = false }) {
  const href = localeHref(target);
  return (
    <a
      href={href}
      hrefLang={target.hreflang}
      aria-current={isCurrent ? "page" : undefined}
      onClick={(event) => {
        event.currentTarget.href = href + window.location.hash;
      }}
    >
      {hasCheck ? <Icon name="check" size={14} className="lang-check" /> : null}
      <span lang={target.htmlLang} dir={target.dir}>
        {target.endonym}
      </span>
    </a>
  );
}
