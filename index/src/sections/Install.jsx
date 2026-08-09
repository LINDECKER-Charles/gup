/** 08 · Install — the conversion target, plus six copy-paste examples. */
import { Shell } from "../ui/Shell.jsx";
import { CopyButton } from "../ui/CopyButton.jsx";
import { Heart } from "../lib/icons.jsx";
import { installCommand } from "../data/facts.js";
import { install } from "../data/content.js";
import { KOFI_URL } from "../data/site.js";

export function Install() {
  const [title, subtitle] = install.title;

  return (
    <section className="section" id="install" aria-labelledby="install-title">
      <Shell>
        <div className="install-hero" data-reveal="30">
          <span className="mono-label">{install.label}</span>
          <h2 className="display display--cta" id="install-title">
            {title}
            <br />
            {subtitle}
          </h2>
          <p className="install-lead">{install.lead}</p>

          <div className="install-row">
            <p className="install-cmd">
              <span className="cmd-prompt" aria-hidden="true">
                $
              </span>
              <code>{installCommand}</code>
              <span className="install-caret" aria-hidden="true" />
            </p>
            <CopyButton className="btn btn--primary install-copy" />
          </div>

          <ul className="install-trust">
            {install.trust.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>

        <ul className="install-examples" data-reveal="31">
          {install.examples.map((example) => (
            <li className="install-example" key={example.cmd}>
              <code>
                <span className="cmd-prompt" aria-hidden="true">
                  $
                </span>
                {example.cmd}
              </code>
              <span>{example.desc}</span>
            </li>
          ))}
        </ul>

        <div className="banner banner--amber" data-reveal="32">
          <div className="banner-text">
            <h3>{install.support.title}</h3>
            <p>{install.support.text}</p>
          </div>
          <a
            className="btn btn--amber"
            href={KOFI_URL}
            target="_blank"
            // `sponsored` is the correct annotation for a donation link, and
            // keeps it from being read as an editorial endorsement.
            rel="noopener sponsored"
          >
            <Heart />
            Ko-fi
          </a>
        </div>
      </Shell>
    </section>
  );
}
