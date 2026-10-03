import type { HttpRoute } from "./types.js";

/**
 * Routes of the release APIs providers ask for a "latest version", answered
 * with the minimal payload the real API returns. Hand-written on purpose: the
 * APIs are versioned and stable, recorded bodies would be large and churn.
 */

/** `GET https://api.github.com/repos/<owner>/<repo>/releases/latest` → `{ tag_name }`. */
export function githubLatest(ownerRepo: string, tagName: string): HttpRoute {
  return {
    url: `https://api.github.com/repos/${ownerRepo}/releases/latest`,
    json: { tag_name: tagName },
  };
}

/** `GET https://api.releases.hashicorp.com/v1/releases/<product>/latest` → `{ version }`. */
export function hashicorpLatest(product: string, version: string): HttpRoute {
  return {
    url: `https://api.releases.hashicorp.com/v1/releases/${product}/latest`,
    json: { version },
  };
}

/**
 * `GET https://registry.npmjs.org/<name>/latest` → `{ version }`; without a
 * version, the valid answer that names none.
 */
export function npmLatestRoute(name: string, version?: string): HttpRoute {
  return { url: `https://registry.npmjs.org/${name}/latest`, json: version ? { version } : {} };
}

/** `GET https://pypi.org/pypi/<name>/json` → `{ info: { version } }`, or an `info` without one. */
export function pypiRoute(name: string, version?: string): HttpRoute {
  return { url: `https://pypi.org/pypi/${name}/json`, json: { info: version ? { version } : {} } };
}
