/**
 * 03 · How it works — an ordered list of three steps (the order is the point)
 * and a link to the architecture doc. The connecting rule is CSS.
 */
import { LINKS } from "../data/links.js";
import { STRUCTURE } from "../data/structure.js";
import { useI18n } from "../i18n/use-i18n.js";
import { Icon } from "../ui/Icon.jsx";
import { RichText } from "../ui/RichText.jsx";
import { Section } from "../ui/Section.jsx";

export function HowItWorks() {
  const { how } = useI18n().messages;

  return (
    <Section id="how" kicker={how.kicker} title={how.title} lead={how.lead}>
      <ol className="steps">
        {STRUCTURE.howSteps.map((step, index) => (
          <li key={step} className="step" data-reveal={index}>
            <span className="step-number" aria-hidden="true">
              {String(index + 1).padStart(2, "0")}
            </span>
            <h3 className="step-title">{how.steps[step].title}</h3>
            <p className="step-text">
              <RichText text={how.steps[step].text} />
            </p>
          </li>
        ))}
      </ol>
      <a className="link-arrow" href={LINKS.resources.architecture} hrefLang="en">
        <span>{how.docsLink}</span>
        <Icon name="arrow" size={14} />
      </a>
    </Section>
  );
}
