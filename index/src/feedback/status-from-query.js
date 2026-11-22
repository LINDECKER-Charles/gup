/**
 * The outcome of a plain (no-JavaScript) form post, which the service reports
 * by redirecting back with `?feedback=sent|invalid|limited`.
 */
import { QUERY, STATUSES } from "./rules.js";

/**
 * @param {string} search  `location.search`
 * @returns {"sent" | "invalid" | "limited" | null}
 */
export function statusFromQuery(search) {
  const value = new URLSearchParams(search).get(QUERY.status);
  return STATUSES.includes(value) ? value : null;
}

/**
 * The URL without the status parameter, so a reload or a shared link does not
 * replay an outcome. Everything else (prefill, fragment) stays.
 *
 * @param {string} href
 */
export function withoutStatus(href) {
  const url = new URL(href);
  url.searchParams.delete(QUERY.status);
  return url.href;
}
