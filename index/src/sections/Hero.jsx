import { Container } from "../ui/Container.jsx";
import { Terminal } from "../ui/Terminal.jsx";
import { Arrow } from "../lib/icons.jsx";
import { content } from "../data/content.js";

export function Hero() {
  const { hero } = content;
  const [line1, line2, line3] = hero.title;

  return (
    <section className="hero hero--top">
      <Container>
        <div className="hero-grid">
          <div>
            <div className="eyebrow">
              <span className="dot" />
              {hero.eyebrow}
            </div>
            <h1>
              {line1}<br />
              <em>{line2}</em><br />
              {line3}
            </h1>
            <p className="lead">
              <strong className="lead-strong">gup</strong> {hero.lead}
            </p>
            <div className="hero-cta">
              <a className="btn btn-primary" href="#install">
                Installer <Arrow />
              </a>
              <a className="btn btn-ghost" href="#modes">
                Voir le fonctionnement
              </a>
            </div>
            <div className="hero-meta">
              {hero.stats.map((s) => (
                <div key={s.label}>
                  <strong>{s.value}</strong>
                  {s.label}
                </div>
              ))}
            </div>
          </div>
          <Terminal />
        </div>
      </Container>
    </section>
  );
}
