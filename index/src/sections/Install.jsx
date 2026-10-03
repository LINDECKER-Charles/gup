/**
 * 06 · Install — the conversion target: the install command, five example
 * commands, and the support banner.
 */
import { LINKS } from "../data/links.js";
import { STRUCTURE } from "../data/structure.js";
import { useI18n } from "../i18n/use-i18n.js";
import { Icon } from "../ui/Icon.jsx";
import { InstallCommand } from "../ui/InstallCommand.jsx";
import { Section } from "../ui/Section.jsx";

/** Ko-fi is a paid placement in the link graph, hence `sponsored`. */
const SUPPORT_LINKS = [
  { id: "kofi", href: LINKS.kofi, rel: "noopener sponsored", icon: "heart", tone: "amber" },
  { id: "sponsors", href: LINKS.sponsors, rel: "noopener", tone: "ghost" },
  { id: "star", href: LINKS.repo, rel: "noopener", icon: "star", tone: "ghost" },
];

function Support({ support }) {
  return (
    <aside className="support" aria-labelledby="support-title">
      <div>
        <h3 className="support-title" id="support-title">
          {support.title}
        </h3>
        <p className="support-text">{support.text}</p>
      </div>
      <ul className="support-links">
        {SUPPORT_LINKS.map((link) => (
          <li key={link.id}>
            <a className={`btn btn--${link.tone}`} href={link.href} target="_blank" rel={link.rel}>
              {link.icon ? <Icon name={link.icon} /> : null}
              <span>{support[link.id]}</span>
            </a>
          </li>
        ))}
      </ul>
    </aside>
  );
}

export function Install() {
  const { install } = useI18n().messages;

  return (
    <Section id="install" kicker={install.kicker} title={install.title} lead={install.lead}>
      <div className="install-panel" data-reveal={0}>
        <InstallCommand />
        <ul className="examples">
          {STRUCTURE.examples.map((example) => (
            <li key={example.id} className="example">
              <code dir="ltr" translate="no">
                <span aria-hidden="true">$ </span>
                {example.cmd}
              </code>
              <span>{install.examples[example.id]}</span>
            </li>
          ))}
        </ul>
      </div>
      <Support support={install.support} />
    </Section>
  );
}
