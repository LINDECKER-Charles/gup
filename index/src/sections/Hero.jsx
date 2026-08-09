/**
 * Hero + stat bar.
 *
 * The H1 is the page's LCP element and its only H1. It is split into three
 * masked lines that rise in sequence — the mask is on the wrapper, the
 * animation on the inner span, so the parallax transform on the column never
 * fights the reveal.
 */
import { Shell } from "../ui/Shell.jsx";
import { Counter } from "../ui/Counter.jsx";
import { CopyButton } from "../ui/CopyButton.jsx";
import { Arrow } from "../lib/icons.jsx";
import { facts } from "../data/facts.js";
import { hero, stats } from "../data/content.js";

/** One cell per provider: 18 across, so the pulse reads as a scan front
 *  sweeping row by row. Deterministic — the prerender and the hydrated tree
 *  must produce identical markup. */
const CELLS = Array.from({ length: facts.providerCount }, (_, i) => ({
  color: i % 7 === 3 ? "var(--amber-warm)" : "oklch(0.72 0.19 275)",
  delay: `${(i % 18) * 90 + Math.floor(i / 18) * 210}ms`,
}));

function ScanPanel() {
  return (
    <div data-parallax="0.09">
      <div className="scan">
        <span className="scan-sweep" aria-hidden="true" />
        <div className="scan-head">
          <span className="scan-head-title">{hero.scan.title}</span>
          <span className="scan-head-meta">
            <span className="spinner" aria-hidden="true" />
            {hero.scan.meta}
          </span>
        </div>
        <div className="scan-grid" aria-hidden="true">
          {CELLS.map((cell, i) => (
            <span
              key={i}
              className="scan-cell"
              style={{ background: cell.color, animationDelay: cell.delay }}
            />
          ))}
        </div>
        <div className="scan-rail" aria-hidden="true">
          <span />
        </div>
        <div className="scan-foot">
          <div className="scan-rotator" aria-hidden="true">
            <div>
              {hero.scan.rotator.map((name, i) => (
                <span key={i}>{name}</span>
              ))}
            </div>
          </div>
          <span className="scan-count">{hero.scan.outdated}</span>
        </div>
      </div>
    </div>
  );
}

function Headline() {
  const [first, accent, last] = hero.title;
  return (
    <h1 className="display display--hero">
      <span className="hero-line">
        <span>{first}</span>
      </span>
      <span className="hero-line hero-line--gradient">
        <span>{accent}</span>
      </span>
      <span className="hero-line">
        <span>{last}</span>
      </span>
    </h1>
  );
}

export function Hero() {
  return (
    <>
      <section className="hero" aria-label="gup en une phrase">
        <span className="hero-wipe" aria-hidden="true" />
        <Shell>
          <div className="hero-grid">
            <div data-parallax="-0.05">
              <p className="hero-eyebrow">
                <span className="pulse" aria-hidden="true" />
                {hero.eyebrow}
              </p>
              <Headline />
              <p className="hero-lead">
                {hero.lead.before}
                {hero.lead.strong.map((word, i) => (
                  <span key={word}>
                    <strong>{word}</strong>
                    {i < hero.lead.strong.length - 1 ? ", " : ""}
                  </span>
                ))}
                {hero.lead.after}
              </p>
              <div className="hero-actions">
                <a className="btn btn--primary" href="#install">
                  <span className="btn-sheen" aria-hidden="true" />
                  <span>Installer gratuitement</span>
                  <Arrow size={15} />
                </a>
                <CopyButton
                  className="btn btn--ghost"
                  label="Copier la commande"
                  showState
                />
              </div>
              <ul className="hero-trust">
                {hero.trust.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <ScanPanel />
          </div>
        </Shell>
      </section>

      <section className="stats" aria-label="gup en chiffres">
        <Shell>
          <ul className="stats-grid" data-reveal="6">
            {stats.map((stat) => (
              <li className="stat" key={stat.label}>
                <span className="stat-value">
                  {stat.prefix ? (
                    <span className="stat-prefix">{stat.prefix}</span>
                  ) : null}
                  <Counter value={stat.value} suffix={stat.suffix} />
                </span>
                <span className="stat-label">{stat.label}</span>
              </li>
            ))}
          </ul>
        </Shell>
      </section>
    </>
  );
}
