/**
 * Sticky header. The section links collapse below 860px rather than folding
 * into a drawer: every one of them is a jump inside a single page that also
 * ends on the same install CTA, so a hamburger would add a menu to reach
 * content the reader is already scrolling through.
 */
import { Shell } from "../ui/Shell.jsx";
import { BrandMark } from "../ui/BrandMark.jsx";
import { GitHub } from "../lib/icons.jsx";
import { facts } from "../data/facts.js";
import { NAV_LINKS, REPO_URL, SITE_URL } from "../data/site.js";

export function Nav() {
  return (
    <header className="nav">
      <Shell>
        <div className="nav-inner">
          <a className="nav-brand" href={SITE_URL} aria-label="gup — accueil">
            <BrandMark size={30} className="nav-mark" loading="eager" />
            <span className="nav-word">GUP</span>
            <span className="nav-version">v{facts.version}</span>
          </a>

          <nav className="nav-links" aria-label="Sections de la page">
            {NAV_LINKS.map((link) => (
              <a key={link.href} href={link.href}>
                {link.label}
              </a>
            ))}
          </nav>

          <div className="nav-actions">
            <a
              className="nav-icon-link"
              href={REPO_URL}
              target="_blank"
              rel="noopener"
              aria-label="Code source sur GitHub"
            >
              <GitHub />
            </a>
            <a className="btn btn--primary nav-cta" href="#install">
              <span className="btn-sheen" aria-hidden="true" />
              <span>Installer</span>
            </a>
          </div>
        </div>
      </Shell>
    </header>
  );
}
