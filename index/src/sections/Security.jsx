/**
 * 04 · Security — why a tool that runs privileged commands is worth trusting:
 * three compact cards with neutral tool tags, then the policy and the
 * contribution guide.
 */
import { LINKS } from "../data/links.js";
import { STRUCTURE } from "../data/structure.js";
import { useI18n } from "../i18n/use-i18n.js";
import { Icon } from "../ui/Icon.jsx";
import { RichText } from "../ui/RichText.jsx";
import { Section } from "../ui/Section.jsx";

const DOC_LINKS = [
  { id: "policy", href: LINKS.resources.security },
  { id: "contributing", href: LINKS.resources.contributing },
];

function TrustCard({ item, copy, order }) {
  return (
    <li className="trust-card" data-reveal={order}>
      <h3 className="trust-title">{copy.title}</h3>
      <p className="trust-text">
        <RichText text={copy.text} />
      </p>
      <ul className="tags">
        {item.tags.map((tag) => (
          <li key={tag} className="chip chip--quiet" translate="no">
            {tag}
          </li>
        ))}
      </ul>
    </li>
  );
}

export function Security() {
  const { security } = useI18n().messages;

  return (
    <Section id="security" kicker={security.kicker} title={security.title} lead={security.lead}>
      <ul className="trust-cards">
        {STRUCTURE.security.map((item, index) => (
          <TrustCard key={item.id} item={item} copy={security.items[item.id]} order={index} />
        ))}
      </ul>
      <p className="link-row">
        {DOC_LINKS.map((link) => (
          <a key={link.id} className="link-arrow" href={link.href} hrefLang="en">
            <span>{security.links[link.id]}</span>
            <Icon name="arrow" size={14} />
          </a>
        ))}
      </p>
    </Section>
  );
}
