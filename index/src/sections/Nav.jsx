import { Container } from "../ui/Container.jsx";
import { Heart, GitHub } from "../lib/icons.jsx";
import { content } from "../data/content.js";

// Vite-injected at build time (matches `base` in vite.config.js, e.g. "/gup/").
// Using BASE_URL keeps logo URLs valid regardless of the page's current path —
// relative paths like "public/logo-32.png" would break under any future
// non-root client route.
const BASE = import.meta.env.BASE_URL;

export function Nav() {
  const { nav } = content;

  return (
    <header className="nav">
      <Container>
        <div className="nav-inner">
          <a href="#" className="nav-brand" aria-label="gup — accueil">
            <picture>
              <source
                type="image/webp"
                srcSet={`${BASE}public/logo-32.webp 1x, ${BASE}public/logo-64.webp 2x`}
              />
              <img
                className="nav-brand-mark"
                src={`${BASE}public/logo-32.png`}
                srcSet={`${BASE}public/logo-32.png 1x, ${BASE}public/logo-64.png 2x`}
                alt="gup logo"
                width={36}
                height={36}
                decoding="async"
                loading="eager"
              />
            </picture>
            <span className="nav-version">{nav.brandVersion}</span>
          </a>
          <nav className="nav-links">
            {nav.links.map((l) => (
              <a key={l.href} href={l.href}>{l.label}</a>
            ))}
          </nav>
          <div className="nav-actions">
            <a
              className="nav-kofi"
              href={nav.kofiUrl}
              target="_blank"
              rel="noopener"
              title="Soutenir le projet sur Ko-fi"
              aria-label="Soutenir le projet sur Ko-fi"
            >
              <Heart size={13} /> <span>Ko-fi</span>
            </a>
            <a className="nav-cta" href={nav.githubUrl} target="_blank" rel="noopener">
              <GitHub size={14} /> <span>GitHub</span>
            </a>
          </div>
        </div>
      </Container>
    </header>
  );
}
