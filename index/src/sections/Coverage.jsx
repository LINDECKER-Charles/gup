/**
 * 02 · Coverage — the provider count, one card per OS, the managers that
 * behave the same everywhere, and the full registry inventory by domain in a
 * collapsed <details>: real, crawlable long-tail content that costs no
 * vertical space until asked for.
 */
import { providersByDomain } from "../data/facts.js";
import { LINKS } from "../data/links.js";
import { PLATFORMS } from "../data/platforms.js";
import { useI18n } from "../i18n/use-i18n.js";
import { Icon } from "../ui/Icon.jsx";
import { RichText } from "../ui/RichText.jsx";
import { Section } from "../ui/Section.jsx";

function SystemCard({ system, coverage }) {
  const copy = coverage.platforms[system.id];
  return (
    <li className="os-card" data-reveal={0}>
      <p className="os-head">
        <Icon name={system.id} size={28} className="os-icon" />
        <span className="badge">{copy.badge}</span>
      </p>
      <h3 className="os-name">{system.name}</h3>
      <ul className="os-managers">
        {system.managers.map((manager) => (
          <li key={manager.name}>
            <span translate="no">{manager.name}</span>
            {manager.isDelegated ? (
              <span className="os-delegated"> · {coverage.delegated}</span>
            ) : null}
          </li>
        ))}
      </ul>
      <p className="os-foot">
        <RichText text={copy.foot} />
      </p>
    </li>
  );
}

function Inventory({ coverage }) {
  return (
    <details className="inventory">
      <summary>
        <span>{coverage.allProviders}</span>
        <Icon name="chevron" className="inventory-chevron" />
      </summary>
      <dl className="inventory-list">
        {Object.entries(providersByDomain).map(([domain, ids]) => (
          <div key={domain} className="inventory-row">
            <dt>{coverage.domains[domain]}</dt>
            <dd translate="no">{ids.join(" · ")}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

export function Coverage() {
  const { coverage } = useI18n().messages;

  return (
    <Section id="coverage" kicker={coverage.kicker} title={coverage.title} lead={coverage.lead}>
      <ul className="os-grid">
        {PLATFORMS.systems.map((system) => (
          <SystemCard key={system.id} system={system} coverage={coverage} />
        ))}
      </ul>
      <div className="everywhere">
        <h3 className="everywhere-title">{coverage.everywhere}</h3>
        <ul className="chips">
          {PLATFORMS.crossPlatform.map((name) => (
            <li key={name} className="chip" translate="no">
              {name}
            </li>
          ))}
        </ul>
      </div>
      <Inventory coverage={coverage} />
      <a className="link-arrow" href={LINKS.resources.providers} hrefLang="en">
        <span>{coverage.catalogLink}</span>
        <Icon name="arrow" size={14} />
      </a>
    </Section>
  );
}
