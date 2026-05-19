import { Fragment } from "react";
import { Container } from "../ui/Container.jsx";
import { Snippet } from "../ui/Snippet.jsx";
import { Heart, Arrow } from "../lib/icons.jsx";
import { content } from "../data/content.js";

function InstallCard({ card }) {
  return (
    <div className="install-card">
      <h3>{card.title} <span className="badge">{card.badge}</span></h3>
      <p>{card.desc}</p>
      {card.snippets.map((cmd, i) => (
        <Fragment key={cmd}>
          {i > 0 && <div className="install-card-gap" />}
          <Snippet cmd={cmd} />
        </Fragment>
      ))}
    </div>
  );
}

function ExampleRow({ cmd, desc }) {
  return (
    <div className="install-snippet install-example">
      <code className="install-example-code">
        <span className="prompt">$</span>
        {cmd}
      </code>
      <span className="install-example-desc">{desc}</span>
    </div>
  );
}

function SupportCard({ support }) {
  return (
    <div className="support-card">
      <div className="support-card-text">
        <h3>{support.title}</h3>
        <p>{support.lead}</p>
      </div>
      <a
        className="btn btn-kofi"
        href={support.kofiUrl}
        target="_blank"
        rel="noopener"
        aria-label="Soutenir charleslindecker sur Ko-fi"
      >
        <Heart size={14} />
        {support.cta}
        <Arrow size={13} />
      </a>
    </div>
  );
}

export function Install() {
  const { install } = content;

  return (
    <section id="install">
      <Container>
        <div className="sec-head">
          <div className="sec-label">{install.sectionLabel}</div>
          <div className="sec-title">
            <h2>{install.title}</h2>
            <p>{install.lead}</p>
          </div>
        </div>

        <div className="install-grid">
          {install.cards.map((c) => (
            <InstallCard key={c.title} card={c} />
          ))}
        </div>

        <div className="install-examples">
          {install.examples.map((ex) => (
            <ExampleRow key={ex.cmd} cmd={ex.cmd} desc={ex.desc} />
          ))}
        </div>

        <SupportCard support={install.support} />
      </Container>
    </section>
  );
}
