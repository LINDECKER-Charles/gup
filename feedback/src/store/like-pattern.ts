/**
 * An ILIKE pattern that finds `search` anywhere in a text: `%`, `_` and the
 * escape character itself match literally.
 */
export function likePattern(search: string): string {
  return `%${search.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
}
