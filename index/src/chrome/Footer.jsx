/**
 * Footer: brand, tagline and the documentation link graph — the topical
 * cluster around the landing page and the only internal links crawlers can
 * follow from it. The docs are English-only, so their links say so with
 * `hrefLang="en"` on every locale.
 */
import { LINKS } from "../data/links.js";
import { STRUCTURE } from "../data/structure.js";
import { localeHref } from "../i18n/locale-href.js";
import { useI18n } from "../i18n/use-i18n.js";
import { BrandMark } from "../ui/BrandMark.jsx";
import { Shell } from "../ui/Shell.jsx";

function FooterColumn({ column, footer }) {
  return (
    <nav aria-labelledby={`foot-${column.id}`}>
      <h2 className="foot-title" id={`foot-${column.id}`}>
        {footer.columns[column.id]}
      </h2>
      <ul className="foot-list">
        {column.links.map((link) => (
          <li key={link}>
            <a href={LINKS.resources[link]} hrefLang="en">
              {footer.links[link]}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function Footer() {
  const { locale, messages } = useI18n();
  const { footer, common } = messages;

  return (
    <footer className="foot">
      <Shell>
        <div className="foot-grid">
          <div className="foot-intro">
            <a className="foot-brand" href={localeHref(locale)} aria-label={common.home}>
              <BrandMark size={28} className="foot-mark" />
              <span className="foot-word">GUP</span>
            </a>
            <p className="foot-tagline">{footer.tagline}</p>
          </div>
          {STRUCTURE.footer.map((column) => (
            <FooterColumn key={column.id} column={column} footer={footer} />
          ))}
        </div>
        <p className="foot-legal">{footer.legal}</p>
      </Shell>
    </footer>
  );
}
