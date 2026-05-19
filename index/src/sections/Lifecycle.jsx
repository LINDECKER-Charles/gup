import { Container } from "../ui/Container.jsx";
import { Arrow } from "../lib/icons.jsx";
import { content } from "../data/content.js";

export function Lifecycle() {
  const { lifecycle } = content;

  return (
    <section id="lifecycle">
      <Container>
        <div className="sec-head">
          <div className="sec-label">{lifecycle.sectionLabel}</div>
          <div className="sec-title">
            <h2>Du <code className="inline-mono">$ gup</code> au résumé final.</h2>
            <p>{lifecycle.lead}</p>
          </div>
        </div>
        <div className="lifecycle">
          {lifecycle.steps.map((s) => (
            <div className="life-step" key={s.num}>
              <div className="num">{s.num}</div>
              <h4>{s.title}</h4>
              <p>{s.desc}</p>
              <span className="arrow"><Arrow size={11} /></span>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}
