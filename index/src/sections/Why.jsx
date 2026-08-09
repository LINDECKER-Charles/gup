/** 01 · Why — the fifteen commands you run by hand, versus one. */
import { Shell } from "../ui/Shell.jsx";
import { SectionLabel } from "../ui/SectionLabel.jsx";
import { LegacyAnchor } from "../ui/LegacyAnchor.jsx";
import { Arrow } from "../lib/icons.jsx";
import { why } from "../data/content.js";

const STAGGER_MS = 220;

export function Why() {
  const [title, subtitle] = why.title;

  return (
    <section className="section" id="pourquoi" aria-labelledby="pourquoi-title">
      <LegacyAnchor ids={["problem"]} />
      <Shell>
        <SectionLabel reveal="8">{why.label}</SectionLabel>

        <h2
          className="display display--section sec-title"
          id="pourquoi-title"
          data-reveal="9"
        >
          {title}
          <br />
          <span className="dim">{subtitle}</span>
        </h2>

        <div className="why-grid" data-reveal="10">
          <ul className="why-before">
            {why.commands.map((cmd, i) => (
              <li
                className="why-cmd"
                key={cmd}
                style={{ animationDelay: `${i * STAGGER_MS}ms` }}
              >
                <span className="why-cmd-ix">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="why-cmd-text">{cmd}</span>
              </li>
            ))}
            <li className="why-more">{why.more}</li>
          </ul>

          <div className="why-arrow" aria-hidden="true">
            <span className="why-arrow-badge">
              <Arrow size={16} />
            </span>
          </div>

          <div className="why-after">
            <p className="why-after-brand">
              <span className="cmd-prompt" aria-hidden="true">
                $
              </span>
              <span>GUP</span>
            </p>
            <div className="why-after-list">
              {why.after.map((point) => (
                <div key={point.key}>
                  <span className="why-after-key">{point.key}</span>
                  <span>{point.text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Shell>
    </section>
  );
}
