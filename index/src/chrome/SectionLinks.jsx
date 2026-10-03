/**
 * The header's in-page links. Visible at every width: on narrow screens they
 * form a second header row that scrolls sideways instead of hiding behind a
 * hamburger. The section in view gets `aria-current="location"`.
 */
import { STRUCTURE } from "../data/structure.js";
import { useI18n } from "../i18n/use-i18n.js";
import { useScrollspy } from "../lib/use-scrollspy.js";

const NAV_IDS = Object.freeze(
  STRUCTURE.sections.filter((section) => section.isInNav).map((section) => section.id),
);

export function SectionLinks() {
  const { nav } = useI18n().messages;
  const active = useScrollspy(NAV_IDS);

  return (
    <nav className="nav-links" aria-label={nav.label}>
      <ul>
        {NAV_IDS.map((id) => (
          <li key={id}>
            <a href={`#${id}`} aria-current={active === id ? "location" : undefined}>
              {nav[id]}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
