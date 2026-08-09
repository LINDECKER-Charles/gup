/**
 * 02 · Platforms — what gup drives on each of the three systems.
 *
 * The per-OS lists are deliberately narrower than the source design's: see the
 * accuracy note in data/platforms.js. Nothing here claims a package manager
 * the registry cannot actually reach on that platform.
 */
import { Shell } from "../ui/Shell.jsx";
import { SectionLabel } from "../ui/SectionLabel.jsx";
import { Marquee } from "../ui/Marquee.jsx";
import { Arrow, PLATFORM_GLYPHS } from "../lib/icons.jsx";
import { platforms } from "../data/platforms.js";

function PlatformCard({ card }) {
  const Glyph = PLATFORM_GLYPHS[card.icon];
  return (
    <li
      className={`card card--tilt plat-card${card.isNew ? " plat-card--new" : ""}`}
      data-tilt="1"
    >
      <span className="plat-card-rule" aria-hidden="true" />
      <div className="plat-icon">
        <Glyph />
      </div>
      <div className="plat-head">
        <h3 className="display display--card">{card.name}</h3>
        <span
          className={`chip--badge${card.isNew ? " chip--badge-new" : ""}`}
        >
          {card.badge}
        </span>
      </div>
      <ul className="plat-tags">
        {card.managers.map((manager) => (
          <li className="chip" key={manager}>
            {manager}
          </li>
        ))}
      </ul>
      <p className="plat-foot">{card.foot}</p>
    </li>
  );
}

export function Platforms() {
  const [title, subtitle] = platforms.title;

  return (
    <section className="section" id="plateformes" aria-labelledby="plateformes-title">
      <Shell>
        <SectionLabel reveal="11" flag={platforms.flag}>
          {platforms.label}
        </SectionLabel>

        <div className="sec-split" data-reveal="12">
          <h2 className="display display--section" id="plateformes-title">
            {title}
            <br />
            {subtitle}
          </h2>
          <p className="lead">{platforms.lead}</p>
        </div>

        <ul className="plat-grid" data-reveal="13">
          {platforms.cards.map((card) => (
            <PlatformCard card={card} key={card.name} />
          ))}
        </ul>

        <Marquee items={platforms.crossPlatform} reveal="14" />

        <div className="banner" data-reveal="15">
          <p className="banner-title">{platforms.banner.title}</p>
          <a className="btn btn--compact" href="#install">
            {platforms.banner.cta}
            <Arrow />
          </a>
        </div>
      </Shell>
    </section>
  );
}
