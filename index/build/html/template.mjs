/**
 * Fills exact-string slots in an HTML template.
 *
 * Each marker must occur exactly once. A missing slot means the template
 * changed shape (or a future Vite started stripping HTML comments) and a
 * duplicated one means content would be emitted twice: both fail the build
 * rather than ship an empty or doubled page.
 */

const occurrences = (text, marker) => text.split(marker).length - 1;
const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * @param {string} template
 * @param {Readonly<Record<string, string>>} slots  marker → replacement
 */
export function fillTemplate(template, slots) {
  const markers = Object.keys(slots);
  if (markers.length === 0) return template;
  for (const marker of markers) {
    const count = occurrences(template, marker);
    if (count !== 1) throw new Error(`template: slot ${marker} found ${count} time(s)`);
  }
  // One pass with a callback: inserted content is never rescanned for other
  // markers, and `$&`-style sequences in it are not interpreted.
  const pattern = new RegExp(markers.map(escapeRegExp).join("|"), "g");
  return template.replace(pattern, (marker) => slots[marker]);
}
