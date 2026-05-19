import { Container } from "../ui/Container.jsx";
import { content } from "../data/content.js";

export function Problem() {
  const { problem } = content;

  return (
    <section id="problem">
      <Container>
        <div className="sec-head">
          <div className="sec-label">{problem.sectionLabel}</div>
          <div className="sec-title">
            <h2>{problem.title}</h2>
            <p>{problem.lead}</p>
          </div>
        </div>

        <div className="problem-grid">
          <div className="before-after">
            <h3><span className="pill">avant</span> Le workflow manuel</h3>
            <ul className="cmd-list">
              {problem.commands.map((c, i) => (
                <li key={c}>
                  <span className="ix">{String(i + 1).padStart(2, "0")}</span>
                  <span className="cmd-name">{c}</span>
                </li>
              ))}
              <li className="cmd-list-overflow">{problem.overflowLabel}</li>
            </ul>
          </div>

          <div className="before-after after">
            <h3><span className="pill">après</span> Le workflow gup</h3>
            <div className="solo-cmd">
              <span className="prompt">$</span>
              <span className="cmd">gup</span>
            </div>
            <p className="after-lead">
              Scan parallèle <strong>fan-out</strong> des providers détectés, table unifiée, menu interactif. Les sorties hétérogènes (JSON, texte tabulaire, feeds GitHub Releases) sont homogénéisées derrière un seul type : <code className="inline-mono">OutdatedPackage</code>.
            </p>
            <div className="after-foot">
              {problem.afterPoints.map((p) => (
                <span key={p.strong}><strong>{p.strong}</strong> · {p.text}</span>
              ))}
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
