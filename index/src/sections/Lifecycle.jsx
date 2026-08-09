/** 05 · Lifecycle — five ordered steps, from the prompt to the exit code. */
import { Shell } from "../ui/Shell.jsx";
import { SectionLabel } from "../ui/SectionLabel.jsx";
import { LegacyAnchor } from "../ui/LegacyAnchor.jsx";
import { lifecycle } from "../data/content.js";

const STAGGER_MS = 140;

export function Lifecycle() {
  const total = lifecycle.steps.length;

  return (
    <section className="section" id="cycle" aria-labelledby="cycle-title">
      <LegacyAnchor ids={["lifecycle"]} />
      <Shell>
        <SectionLabel reveal="23">{lifecycle.label}</SectionLabel>

        <h2
          className="display display--section sec-title"
          id="cycle-title"
          data-reveal="24"
        >
          {lifecycle.title}
        </h2>

        {/* An ordered list, because the order is the point. */}
        <ol className="life-grid" data-reveal="25">
          {lifecycle.steps.map((step, i) => (
            <li className="life-step" key={step.num}>
              <span
                className="life-fill"
                aria-hidden="true"
                style={{
                  width: `${((i + 1) / total) * 100}%`,
                  animationDelay: `${i * STAGGER_MS}ms`,
                }}
              />
              <span className="life-num">{step.num}</span>
              <h3 className="life-title">{step.title}</h3>
              <p className="life-desc">{step.desc}</p>
            </li>
          ))}
        </ol>
      </Shell>
    </section>
  );
}
