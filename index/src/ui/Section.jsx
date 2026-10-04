/**
 * A numbered page section: anchor, legacy anchor aliases, mono kicker, H2 and
 * optional lead, start-aligned, then the section's own content.
 *
 * The legacy aliases are zero-height targets for fragments earlier versions of
 * the page published (STRUCTURE.sections[].legacyIds): old bookmarks and
 * indexed links keep landing on the right section, without JavaScript and
 * without a redirect.
 */
import { STRUCTURE } from "../data/structure.js";
import { RichText } from "./RichText.jsx";
import { Shell } from "./Shell.jsx";

const legacyIdsOf = (id) =>
  STRUCTURE.sections.find((section) => section.id === id)?.legacyIds ?? [];

/**
 * @param {{ id: string, kicker: string, title: string, lead?: string,
 *   children: import("react").ReactNode }} props
 */
export function Section({ id, kicker, title, lead, children }) {
  return (
    <section className={`section section--${id}`} id={id} aria-labelledby={`${id}-title`}>
      {legacyIdsOf(id).map((alias) => (
        <span key={alias} id={alias} className="anchor-alias" />
      ))}
      <Shell>
        <header className="sec-head" data-reveal="0">
          <p className="kicker">
            <span>{kicker}</span>
            <span className="kicker-rule" aria-hidden="true" />
          </p>
          <h2 className="display display--section" id={`${id}-title`}>
            {title}
          </h2>
          {lead ? (
            <p className="lead">
              <RichText text={lead} />
            </p>
          ) : null}
        </header>
        {children}
      </Shell>
    </section>
  );
}
