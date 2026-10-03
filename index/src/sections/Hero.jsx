/**
 * Hero: eyebrow, the page's only H1 (its LCP element, painted final — nothing
 * above the fold animates in), lead, install command, GitHub link, trust row
 * and the terminal demo. Stacked, not two columns: the TUI mock needs the
 * width. The H1 wraps freely (`text-wrap: balance`) in every language.
 */
import { LINKS } from "../data/links.js";
import { useI18n } from "../i18n/use-i18n.js";
import { Icon } from "../ui/Icon.jsx";
import { InstallCommand } from "../ui/InstallCommand.jsx";
import { RichText } from "../ui/RichText.jsx";
import { Shell } from "../ui/Shell.jsx";
import { Terminal } from "../ui/terminal/Terminal.jsx";

function Headline({ title }) {
  return (
    <h1 className="display display--hero" id="hero-title">
      {title.before}
      <br />
      <span className="hero-accent">{title.accent}</span>
      <br />
      {title.after}
    </h1>
  );
}

function HeroActions({ hero }) {
  return (
    <div className="hero-actions">
      <InstallCommand />
      <a className="btn btn--ghost" href={LINKS.repo} hrefLang="en" target="_blank" rel="noopener">
        <Icon name="github" />
        <span>{hero.secondaryCta}</span>
        <Icon name="external" size={14} />
      </a>
    </div>
  );
}

export function Hero() {
  const { hero } = useI18n().messages;

  return (
    <section className="hero" aria-labelledby="hero-title">
      <Shell>
        <div className="hero-copy">
          <p className="hero-eyebrow">
            <span className="pulse" aria-hidden="true" />
            {hero.eyebrow}
          </p>
          <Headline title={hero.title} />
          <p className="hero-lead">
            <RichText text={hero.lead} />
          </p>
          <HeroActions hero={hero} />
          <ul className="hero-trust">
            {hero.trust.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <Terminal />
      </Shell>
    </section>
  );
}
