/** 03 · Usage — the three ways to drive gup. */
import { Shell } from "../ui/Shell.jsx";
import { SectionLabel } from "../ui/SectionLabel.jsx";
import { LegacyAnchor } from "../ui/LegacyAnchor.jsx";
import { usage } from "../data/content.js";

export function Usage() {
  const [title, subtitle] = usage.title;

  return (
    <section className="section" id="usage" aria-labelledby="usage-title">
      <LegacyAnchor ids={["modes"]} />
      <Shell>
        <SectionLabel reveal="16">{usage.label}</SectionLabel>

        <h2
          className="display display--section sec-title"
          id="usage-title"
          data-reveal="17"
        >
          {title}
          <br />
          {subtitle}
        </h2>

        <ul className="mode-grid" data-reveal="18">
          {usage.modes.map((mode) => (
            <li className="card card--tilt mode-card" data-tilt="1" key={mode.ix}>
              <span className="mode-ix">{mode.ix}</span>
              <h3 className="display display--card">{mode.title}</h3>
              <code className="cmd-block">
                <span className="cmd-prompt" aria-hidden="true">
                  $
                </span>
                {mode.cmd}
              </code>
              <p className="mode-desc">{mode.desc}</p>
            </li>
          ))}
        </ul>
      </Shell>
    </section>
  );
}
