// Architecture section — SVG diagram + 4 cards + Provider interface contract.
// ArchDiagram and ContractBlock live here because they have no reuse elsewhere
// and are tightly coupled to this section's narrative.
import { Container } from "../ui/Container.jsx";
import { content } from "../data/content.js";

function DiagramBox({ x, y, w, h, label, sub, c = "var(--bg-inset)", bc = "var(--border)", fg = "var(--fg)" }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx="8" fill={c} stroke={bc} />
      <text x={x + w / 2} y={y + (sub ? 22 : h / 2 + 5)} textAnchor="middle" fontFamily="var(--mono)" fontSize="13" fill={fg} fontWeight="600">{label}</text>
      {sub && <text x={x + w / 2} y={y + 38} textAnchor="middle" fontFamily="var(--mono)" fontSize="10.5" fill="var(--fg-dim)">{sub}</text>}
    </g>
  );
}

function DiagramLine({ x1, y1, x2, y2, dashed = false }) {
  return (
    <line
      x1={x1} y1={y1} x2={x2} y2={y2}
      stroke="var(--border)" strokeWidth="1.5"
      strokeDasharray={dashed ? "4 4" : "0"}
      markerEnd="url(#arr)"
    />
  );
}

function ArchDiagram() {
  const fanout = [
    { x: 600, label: "winget" },
    { x: 700, label: "npm-g" },
    { x: 800, label: "pip" },
    { x: 900, label: "helm" },
    { x: 1000, label: "cargo" },
  ];

  return (
    <svg viewBox="0 0 1100 480" className="arch-svg-wrap" style={{ maxHeight: 480 }}>
      <defs>
        <marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="var(--border)" />
        </marker>
      </defs>

      <text x="80" y="40" fontFamily="var(--mono)" fontSize="11" fill="var(--fg-dim)">user</text>
      <DiagramBox x={40}  y={50} w={140} h={50} label="$ gup …"          sub="argv"            c="var(--bg-card)" />
      <DiagramBox x={240} y={50} w={170} h={50} label="cli.ts"           sub="commander" />
      <DiagramBox x={460} y={20}  w={120} h={36} label="menu.ts"   c="var(--bg-card)" />
      <DiagramBox x={460} y={60}  w={120} h={36} label="list.ts"   c="var(--bg-card)" />
      <DiagramBox x={460} y={100} w={120} h={36} label="update.ts" c="var(--bg-card)" />
      <DiagramBox x={460} y={140} w={120} h={36} label="doctor.ts" c="var(--bg-card)" />

      <DiagramLine x1={180} y1={75} x2={240} y2={75} />
      <DiagramLine x1={410} y1={75} x2={460} y2={75} />

      <DiagramBox x={640} y={50} w={170} h={50} label="ui/scan-progress" sub="ora · in-flight set" c="var(--bg-card)" />
      <DiagramLine x1={580} y1={75} x2={640} y2={75} />

      <DiagramBox x={870} y={50} w={190} h={70} label="core/registry" sub="ALL_PROVIDERS · pLimit(4)" fg="var(--accent)" bc="var(--accent-dim)" />
      <DiagramLine x1={810} y1={85} x2={870} y2={85} />

      <text x="965" y="160" textAnchor="middle" fontFamily="var(--mono)" fontSize="10.5" fill="var(--fg-dim)">fan-out</text>
      {fanout.map((p) => (
        <g key={p.label}>
          <line x1={965} y1={120} x2={p.x + 40} y2={200} stroke="var(--border-soft)" strokeWidth="1" />
          <rect x={p.x} y={200} width={80} height={36} rx="6" fill="var(--bg-card)" stroke="var(--border-soft)" />
          <text x={p.x + 40} y={222} textAnchor="middle" fontFamily="var(--mono)" fontSize="11" fill="var(--fg)">{p.label}</text>
        </g>
      ))}
      <text x={1060} y={222} fontFamily="var(--mono)" fontSize="11" fill="var(--fg-dim)">…×130</text>

      <DiagramBox x={620} y={290} w={300} h={56} label="core/runner" sub="execa · UTF-8 · windowsHide · no shell" fg="var(--green)" bc="var(--border)" />
      {[640, 740, 840, 940].map((x) => (
        <line key={x} x1={x} y1={236} x2={770} y2={290} stroke="var(--border-soft)" strokeWidth="1" />
      ))}

      <DiagramBox x={620} y={400} w={300} h={50} label="OS subprocesses" sub="winget.exe · npm.cmd · python -m pip · …" c="var(--bg-card)" />
      <DiagramLine x1={770} y1={346} x2={770} y2={400} />

      <g transform="translate(40, 240)">
        <rect width={300} height={210} rx="10" fill="var(--bg-card)" stroke="var(--border-soft)" />
        <text x={20} y={28}  fontFamily="var(--mono)" fontSize="11" fill="var(--accent)" letterSpacing="0.05em">PRINCIPES DIRECTEURS</text>
        <text x={20} y={58}  fontFamily="var(--sans)" fontSize="13" fill="var(--fg)" fontWeight="600">Isolation des providers</text>
        <text x={20} y={76}  fontFamily="var(--sans)" fontSize="11.5" fill="var(--fg-muted)">1 fichier = 1 provider · 0 import croisé</text>
        <text x={20} y={108} fontFamily="var(--sans)" fontSize="13" fill="var(--fg)" fontWeight="600">Shell-out uniquement via runner</text>
        <text x={20} y={126} fontFamily="var(--sans)" fontSize="11.5" fill="var(--fg-muted)">argv-vector · pas de shell: true</text>
        <text x={20} y={158} fontFamily="var(--sans)" fontSize="13" fill="var(--fg)" fontWeight="600">Fail-soft, never-throw</text>
        <text x={20} y={176} fontFamily="var(--sans)" fontSize="11.5" fill="var(--fg-muted)">retourne [] ou {`{ success: false }`}</text>
      </g>
    </svg>
  );
}

function ContractBlock() {
  return (
    <div className="contract">
      <div>
        <h3>Le contrat <code className="inline-mono">Provider</code></h3>
        <p>Toute la valeur de gup réside dans la qualité et l'isolation des ~130 implémentations de cette interface. Quatre méthodes, deux flags déclaratifs, zéro héritage. Ajouter une source = copier _template.ts.</p>
        <p className="contract-flags">
          <strong>slow</strong> filtre le scan en mode --fast.<br />
          <strong>manual</strong> sur un package = "action humaine requise, ne pas montrer".<br />
          <strong>retryable</strong> sur un outcome déclenche le menu de stratégies plus agressives.
        </p>
      </div>
      <pre className="code-block" aria-label="Provider interface">
        <span className="k-kw">interface</span> <span className="k-fn">Provider</span> {"{"}{"\n"}
        {"  "}<span className="k-cm">// kebab-case, unique, stable</span>{"\n"}
        {"  "}<span className="k-kw">readonly</span> <span className="k-key">id</span><span className="k-op">:</span> <span className="k-fn">string</span>;{"\n"}
        {"  "}<span className="k-kw">readonly</span> <span className="k-key">displayName</span><span className="k-op">:</span> <span className="k-fn">string</span>;{"\n"}
        {"  "}<span className="k-kw">readonly</span> <span className="k-key">installHint</span><span className="k-op">?:</span> <span className="k-fn">string</span>;{"\n"}
        {"  "}<span className="k-kw">readonly</span> <span className="k-key">slow</span><span className="k-op">?:</span> <span className="k-fn">boolean</span>;{"\n"}{"\n"}
        {"  "}<span className="k-fn">isAvailable</span>(){" "}<span className="k-op">:</span> <span className="k-fn">Promise</span>{"<"}<span className="k-fn">boolean</span>{">"};{"\n"}
        {"  "}<span className="k-fn">listOutdated</span>(){" "}<span className="k-op">:</span> <span className="k-fn">Promise</span>{"<"}<span className="k-fn">OutdatedPackage</span>[]{">"};{"\n"}
        {"  "}<span className="k-fn">update</span>(<span className="k-key">id</span><span className="k-op">:</span> <span className="k-fn">string</span>, <span className="k-key">opts</span><span className="k-op">?:</span> <span className="k-fn">UpdateOptions</span>){"\n"}
        {"    "}<span className="k-op">:</span> <span className="k-fn">Promise</span>{"<"}<span className="k-fn">UpdateOutcome</span>{">"};{"\n"}
        {"  "}<span className="k-fn">updateAll</span>(<span className="k-key">pkgs</span><span className="k-op">:</span> <span className="k-fn">OutdatedPackage</span>[], <span className="k-key">opts</span><span className="k-op">?:</span> <span className="k-fn">UpdateOptions</span>){"\n"}
        {"    "}<span className="k-op">:</span> <span className="k-fn">Promise</span>{"<"}<span className="k-fn">UpdateOutcome</span>[]{">"};{"\n"}
        {"}"}
      </pre>
    </div>
  );
}

export function Architecture() {
  const { architecture } = content;

  return (
    <section id="architecture">
      <Container>
        <div className="sec-head">
          <div className="sec-label">{architecture.sectionLabel}</div>
          <div className="sec-title">
            <h2>{architecture.title}</h2>
            <p>{architecture.lead}</p>
          </div>
        </div>

        <div className="arch">
          <div className="arch-scroll">
            <ArchDiagram />
          </div>
          <div className="arch-grid">
            {architecture.cards.map((c) => (
              <div className="arch-card" key={c.title}>
                <h4>{c.title}</h4>
                <p>{c.desc}</p>
              </div>
            ))}
          </div>
        </div>

        <ContractBlock />
      </Container>
    </section>
  );
}
