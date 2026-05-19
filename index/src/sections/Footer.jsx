import { Container } from "../ui/Container.jsx";
import { content } from "../data/content.js";

function FooterColumn({ column }) {
  return (
    <div>
      <h5>{column.title}</h5>
      <ul>
        {column.links.map((l) => (
          <li key={l.label}>
            {l.href ? (
              <a href={l.href} target="_blank" rel="noopener">{l.label}</a>
            ) : (
              l.label
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Footer() {
  const { footer } = content;

  return (
    <footer>
      <Container>
        <div className="foot">
          <div className="foot-brand">
            <a href="#" className="nav-brand" aria-label="gup — accueil">
              <picture>
                <source
                  type="image/webp"
                  srcSet="public/logo-32.webp 1x, public/logo-64.webp 2x"
                />
                <img
                  className="nav-brand-mark"
                  src="public/logo-32.png"
                  srcSet="public/logo-32.png 1x, public/logo-64.png 2x"
                  alt="gup logo"
                  width={32}
                  height={32}
                  decoding="async"
                  loading="lazy"
                />
              </picture>
            </a>
            <p>{footer.tagline}</p>
          </div>
          {footer.columns.map((col) => (
            <FooterColumn key={col.title} column={col} />
          ))}
        </div>
        <div className="foot-bottom">
          <span>© {new Date().getFullYear()} {footer.bottom.author}</span>
          <span>{footer.bottom.stack}</span>
        </div>
      </Container>
    </footer>
  );
}
