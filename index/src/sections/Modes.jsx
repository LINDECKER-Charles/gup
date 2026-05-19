import { useState } from "react";
import { Container } from "../ui/Container.jsx";
import { Terminal } from "../ui/Terminal.jsx";
import { content } from "../data/content.js";

export function Modes() {
  const { modes } = content;
  const [active, setActive] = useState(modes.items[0].key);

  return (
    <section id="modes">
      <Container>
        <div className="sec-head">
          <div className="sec-label">{modes.sectionLabel}</div>
          <div className="sec-title">
            <h2>{modes.title}</h2>
            <p>{modes.lead}</p>
          </div>
        </div>

        <div className="modes-grid">
          <div className="modes-list">
            {modes.items.map((m) => (
              <button
                key={m.key}
                className={`mode-tab ${active === m.key ? "active" : ""}`}
                onClick={() => setActive(m.key)}
              >
                <span className="mode-ix">{m.ix}</span>
                <span className="mode-title">{m.title}</span>
                <span className="mode-desc">{m.desc}</span>
              </button>
            ))}
          </div>
          <Terminal initialScene={active} key={active} />
        </div>
      </Container>
    </section>
  );
}
