/**
 * Keeps fragment links from the previous version of this page working.
 *
 * The redesign renamed every section anchor (#problem → #pourquoi,
 * #modes → #usage, #lifecycle → #cycle, #providers → #couverture). Those old
 * fragments are in the wild — nav links that were copied, bookmarks, and at
 * least one JSON-LD block that shipped `#providers`. A zero-height span at the
 * top of the new section keeps them resolving, without JavaScript and without
 * a redirect.
 */
export function LegacyAnchor({ ids }) {
  if (!ids?.length) return null;
  return ids.map((id) => <span key={id} id={id} className="anchor-alias" />);
}
