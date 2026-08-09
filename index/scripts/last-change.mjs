/**
 * When did this page last actually change?
 *
 * Shared by vite.config.js (for `article:modified_time` and the JSON-LD
 * `dateModified`) and scripts/prerender.mjs (for the sitemap `lastmod`), so the
 * three freshness signals can never disagree.
 *
 * Derived from git, not from the deploy clock: the previous pipeline stamped
 * `date -u` on every deploy, so lastmod always said "today" even when nothing
 * had changed — a freshness signal engines learn to discount.
 */
import { execFileSync } from "node:child_process";

/** ISO timestamp of the last commit touching the landing page. */
export function lastContentChange(cwd) {
  const attempts = [
    // The last commit that touched this directory.
    ["log", "-1", "--format=%cI", "--", "."],
    // Fallback: HEAD's own date. Happens on a `workflow_dispatch` run whose
    // HEAD did not touch index/, or on a depth-1 clone.
    ["log", "-1", "--format=%cI"],
  ];
  for (const args of attempts) {
    try {
      const out = execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
      if (out) return out;
    } catch {
      // No git, not a repo, or a shallow clone missing the path — try the next.
    }
  }
  // Last resort (tarball build): now. Still honest — it is all we know.
  return new Date().toISOString();
}

/** The same instant as a bare YYYY-MM-DD, which is what <lastmod> wants. */
export function lastContentChangeDay(cwd) {
  return lastContentChange(cwd).slice(0, 10);
}
