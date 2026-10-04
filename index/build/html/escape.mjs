/**
 * Escapes text for an HTML (or XML) text node or a double/single-quoted
 * attribute value. Every catalog string written into <head>, the sitemap and
 * the 404 goes through it — catalogs are repository content, but a stray `"`
 * in a translation must not be able to close an attribute.
 */
const ENTITIES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** @param {string} text */
export function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (char) => ENTITIES[char]);
}
