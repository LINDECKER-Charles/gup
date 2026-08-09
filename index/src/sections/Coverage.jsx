/**
 * 06 · Coverage — the provider count, big, plus two counter-rotating rails of
 * the domains and the managers behind it.
 *
 * The number is a Counter so it counts up on entry, but it renders the real
 * figure server-side: this is the page's single most quotable fact, and it has
 * to be in the HTML for anything that does not run JavaScript. The caption is
 * folded into the heading for assistive tech — a heading that reads just
 * "134" names nothing.
 */
import { Shell } from "../ui/Shell.jsx";
import { Counter } from "../ui/Counter.jsx";
import { Marquee } from "../ui/Marquee.jsx";
import { LegacyAnchor } from "../ui/LegacyAnchor.jsx";
import { facts } from "../data/facts.js";
import { coverage } from "../data/content.js";
import { DOCS } from "../data/site.js";

export function Coverage() {
  return (
    <section className="section" id="couverture" aria-labelledby="couverture-title">
      <LegacyAnchor ids={["providers"]} />
      <Shell>
        <div className="cover" data-reveal="26" data-cam="1">
          <span className="mono-label">{coverage.label}</span>
          <h2 className="cover-number" id="couverture-title">
            <Counter value={facts.providerCount} />
            <span className="sr-only"> {coverage.caption}</span>
          </h2>
          <p className="cover-caption" aria-hidden="true">
            {coverage.caption}
          </p>
          <p className="cover-lead">
            {coverage.lead.before}
            <code className="code-inline">{coverage.lead.code}</code>
            {coverage.lead.after}{" "}
            <a href={DOCS.providers}>{coverage.catalogLabel}</a>
          </p>
          <Marquee items={coverage.categories} container="cover-rail" />
          <Marquee items={coverage.managers} container="cover-rail" reverse />
        </div>
      </Shell>
    </section>
  );
}
