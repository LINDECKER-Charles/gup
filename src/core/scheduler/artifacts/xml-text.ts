/**
 * Text as an XML text node or attribute value: the five predefined entities
 * escaped, so a path or a description can never close an element or open a
 * new one. Shared by the Task Scheduler XML and the launchd plist.
 */

const ENTITIES: Readonly<Record<string, string>> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&apos;",
};

export function escapeXml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => ENTITIES[char] ?? char);
}
