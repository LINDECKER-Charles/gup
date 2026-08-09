/** 07 · Security — why a tool that runs privileged commands is worth trusting. */
import { Shell } from "../ui/Shell.jsx";
import { SectionLabel } from "../ui/SectionLabel.jsx";
import { security } from "../data/content.js";

const SWEEP_STAGGER_S = 1.2;

export function Security() {
  const [title, subtitle] = security.title;

  return (
    <section className="section" id="securite" aria-labelledby="securite-title">
      <Shell>
        <SectionLabel reveal="27">{security.label}</SectionLabel>

        <div className="sec-split" data-reveal="28">
          <h2 className="display display--section" id="securite-title">
            {title}
            <br />
            {subtitle}
          </h2>
          <p className="lead">{security.lead}</p>
        </div>

        <ul className="sec-grid" data-reveal="29">
          {security.cards.map((card, i) => (
            <li className="card card--tilt sec-card" data-tilt="1" key={card.label}>
              <span
                className="sec-card-sweep"
                aria-hidden="true"
                style={{ animationDelay: `${i * SWEEP_STAGGER_S}s` }}
              />
              <h3>{card.label}</h3>
              <p>{card.desc}</p>
              <ul className="sec-card-tags">
                {card.tags.map((tag) => (
                  <li className="chip chip--quiet" key={tag}>
                    {tag}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </Shell>
    </section>
  );
}
