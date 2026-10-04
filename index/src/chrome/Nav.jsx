/**
 * Sticky header: brand and version, section links, language menu, GitHub,
 * Install. Below 860 px the section links move to a second, horizontally
 * scrolling row and the language menu shrinks to its globe.
 */
import { facts } from "../data/facts.js";
import { LINKS } from "../data/links.js";
import { localeHref } from "../i18n/locale-href.js";
import { useI18n } from "../i18n/use-i18n.js";
import { BrandMark } from "../ui/BrandMark.jsx";
import { Icon } from "../ui/Icon.jsx";
import { Shell } from "../ui/Shell.jsx";
import { LanguageMenu } from "./LanguageMenu.jsx";
import { SectionLinks } from "./SectionLinks.jsx";

function NavActions({ common }) {
  return (
    <div className="nav-actions">
      <LanguageMenu />
      <a
        className="nav-icon-link"
        href={LINKS.repo}
        hrefLang="en"
        target="_blank"
        rel="noopener"
        aria-label={common.github}
      >
        <Icon name="github" />
      </a>
      <a className="btn btn--primary nav-cta" href="#install">
        {common.install}
      </a>
    </div>
  );
}

export function Nav() {
  const { locale, messages } = useI18n();

  return (
    <header className="nav">
      <Shell>
        <div className="nav-inner">
          <a className="nav-brand" href={localeHref(locale)} aria-label={messages.common.home}>
            <BrandMark size={30} className="nav-mark" loading="eager" />
            <span className="nav-word">GUP</span>
            <span className="nav-version">v{facts.version}</span>
          </a>
          <SectionLinks />
          <NavActions common={messages.common} />
        </div>
      </Shell>
    </header>
  );
}
