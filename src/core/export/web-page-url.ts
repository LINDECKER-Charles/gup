/**
 * A web address gup may hand to the browser or send a request to: `https:`,
 * or `http:` on a loopback host (a service or a dev server on this machine),
 * never with credentials in it. Anything else — another scheme (`file:`,
 * `javascript:`), clear text to another machine — is refused.
 */

const SECURE_PROTOCOL = "https:";
const PLAIN_PROTOCOL = "http:";
const LOOPBACK_HOSTS: ReadonlySet<string> = new Set(["127.0.0.1", "localhost", "[::1]"]);

/** `raw` parsed, or null when it is absent, malformed or not acceptable. */
export function webPageUrl(raw: string | undefined): URL | null {
  const text = raw?.trim();
  if (!text) return null;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (url.username !== "" || url.password !== "") return null;
  if (url.protocol === SECURE_PROTOCOL) return url;
  return url.protocol === PLAIN_PROTOCOL && LOOPBACK_HOSTS.has(url.hostname) ? url : null;
}
