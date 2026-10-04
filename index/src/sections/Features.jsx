/**
 * 01 · Features — eight cards: the release's features plus "built for
 * scripts and CI". Three carry a mini visual (journal bars, the contrast
 * swatch, greyed OS rows); all visuals are decorative.
 */
import { STRUCTURE } from "../data/structure.js";
import { useI18n } from "../i18n/use-i18n.js";
import { Icon } from "../ui/Icon.jsx";
import { RichText } from "../ui/RichText.jsx";
import { Section } from "../ui/Section.jsx";

/** Bar heights of the journal sparkline, in percent of the box. */
const JOURNAL_BARS = [34, 58, 41, 76, 52, 88, 63];

const VISUALS = {
  journal: () => (
    <span className="feature-visual feature-bars" aria-hidden="true">
      {JOURNAL_BARS.map((height, index) => (
        <span key={index} style={{ "--bar": `${height}%` }} />
      ))}
    </span>
  ),
  themes: () => (
    <span className="feature-visual feature-swatch" aria-hidden="true">
      <span>Aa</span>
      <span>4.5:1</span>
    </span>
  ),
  os: () => (
    <span className="feature-visual feature-os" aria-hidden="true">
      <span>winget</span>
      <span className="is-off">brew-cask</span>
    </span>
  ),
};

export function Features() {
  const { features, common } = useI18n().messages;

  return (
    <Section id="features" kicker={features.kicker} title={features.title} lead={features.lead}>
      <ul className="features">
        {STRUCTURE.features.map((feature, index) => {
          const Visual = VISUALS[feature.id];
          const copy = features.items[feature.id];
          return (
            <li key={feature.id} className="feature" data-reveal={index}>
              <p className="feature-top">
                <Icon name={feature.icon} size={22} className="feature-icon" />
                {feature.isNew ? <span className="badge badge--new">{common.newBadge}</span> : null}
              </p>
              <h3 className="feature-title">{copy.title}</h3>
              <p className="feature-text">
                <RichText text={copy.text} />
              </p>
              {Visual ? <Visual /> : null}
            </li>
          );
        })}
      </ul>
    </Section>
  );
}
