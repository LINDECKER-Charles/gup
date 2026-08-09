/**
 * Footer. Carries the whole documentation link graph on purpose: since the
 * README was split into docs/, those pages are the topical cluster around this
 * landing page, and the only internal links search engines can follow from it.
 */
import { Shell } from "../ui/Shell.jsx";
import { BrandMark } from "../ui/BrandMark.jsx";
import { footer } from "../data/content.js";
import { FOOTER_COLUMNS, SITE_URL } from "../data/site.js";

export function Footer() {
  return (
    <footer className="foot">
      <Shell>
        <div className="foot-grid">
          <div>
            <a className="foot-brand" href={SITE_URL} aria-label="gup — accueil">
              <BrandMark size={28} className="foot-mark" />
              <span className="foot-word">GUP</span>
            </a>
            <p className="foot-tagline">{footer.tagline}</p>
          </div>

          {FOOTER_COLUMNS.map((column) => (
            <nav key={column.title} aria-labelledby={`foot-${column.title}`}>
              <h2 className="foot-col-title" id={`foot-${column.title}`}>
                {column.title}
              </h2>
              <ul className="foot-list">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <a href={link.href}>{link.label}</a>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="foot-bottom">
          <span>{footer.legal}</span>
          <span>{footer.stack}</span>
        </div>
      </Shell>
    </footer>
  );
}
