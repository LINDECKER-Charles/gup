/**
 * Shared helpers for providers that fetch their "latest version" signal from
 * GitHub Releases (the most common pattern in this codebase). Centralizing
 * here keeps per-provider files focused on parsing the installed binary's
 * own version output and on the update-delegation policy.
 */

interface GitHubReleaseJson {
  tag_name?: string;
  name?: string;
}

export interface FetchLatestOptions {
  /**
   * Strip a leading "v" from the returned tag. Defaults to `true` since most
   * tools embed a v-less version in their own --version output.
   */
  stripVPrefix?: boolean;
  /**
   * Override timeout. Defaults to 5s to keep scans bounded.
   */
  timeoutMs?: number;
}

/** Keeps a scan bounded when GitHub is slow or unreachable. */
const DEFAULT_TIMEOUT_MS = 5_000;

/** One page is enough to find a prefixed tag; GitHub caps the page at 100. */
const DEFAULT_PER_PAGE = 30;

/**
 * `<owner>/<repo>`, anchored to the whole string, with each segment held to the
 * characters and the length GitHub itself allows (39 for an account, 100 for a
 * repository).
 *
 * The anchoring is the point. `ownerRepo` is a literal at nearly every call
 * site, but the mint and Obsidian providers derive it from files on disk —
 * mint's `metadata.json`, a plugin `manifest.json`. Interpolating such a value
 * raw would let a hand-edited or half-written file carry a `/`, a `..` or a
 * query string out of `/repos/<owner>/<repo>/` and aim the request at another
 * API endpoint.
 *
 * Two bounded character classes, no nested quantifier: linear by construction.
 */
const OWNER_REPO = /^([A-Za-z0-9][A-Za-z0-9-]{0,38})\/([A-Za-z0-9][A-Za-z0-9._-]{0,99})$/;

/**
 * `https://api.github.com/repos/<owner>/<repo>/<suffix>` for a slug that passes
 * OWNER_REPO, null for anything else. The two segments are re-encoded from the
 * captured groups rather than taken from the input, so the path can only ever
 * be assembled out of characters the pattern accepted.
 */
function repoApiUrl(ownerRepo: string, suffix: string): string | null {
  const match = OWNER_REPO.exec(ownerRepo);
  const owner = match?.[1];
  const repo = match?.[2];
  if (!owner || !repo) return null;
  const slug = `${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  return `https://api.github.com/repos/${slug}/${suffix}`;
}

/**
 * One GET against the releases API, decoded as JSON. Every failure mode — a
 * slug OWNER_REPO rejects, a non-2xx status, a timeout, a socket error, a body
 * that is not JSON — collapses to null: a release lookup enriches a scan, it
 * must never be able to abort one.
 */
async function fetchReleasesJson<T>(
  ownerRepo: string,
  suffix: string,
  timeoutMs: number,
): Promise<T | null> {
  const url = repoApiUrl(ownerRepo, suffix);
  if (!url) return null;
  try {
    const res = await fetch(url, {
      headers: { accept: "application/vnd.github+json" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

/** Shared tail of both lookups: absent tag means no answer, not an empty one. */
function normalizeTag(tag: string | undefined, stripVPrefix = true): string | null {
  if (!tag) return null;
  return stripVPrefix ? tag.replace(/^v/, "") : tag;
}

/**
 * Fetch the `tag_name` of the latest GitHub release for `<owner>/<repo>`.
 * Returns null on network/HTTP errors so callers can degrade gracefully.
 */
export async function fetchGitHubReleaseLatest(
  ownerRepo: string,
  options: FetchLatestOptions = {},
): Promise<string | null> {
  const data = await fetchReleasesJson<GitHubReleaseJson>(
    ownerRepo,
    "releases/latest",
    options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );
  return normalizeTag(data?.tag_name ?? data?.name, options.stripVPrefix);
}

/**
 * Some projects (kustomize, k3d) prefix release tags with the project name,
 * e.g. `kustomize/v5.4.3`. This walks the release list to find the first tag
 * matching a given prefix.
 */
export async function fetchGitHubReleaseTagMatching(
  ownerRepo: string,
  predicate: (tag: string) => boolean,
  options: FetchLatestOptions & { perPage?: number } = {},
): Promise<string | null> {
  const perPage = options.perPage ?? DEFAULT_PER_PAGE;
  const data = await fetchReleasesJson<GitHubReleaseJson[]>(
    ownerRepo,
    `releases?per_page=${perPage}`,
    options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );
  const tag = data?.map((r) => r.tag_name).find((t) => t && predicate(t));
  return normalizeTag(tag, options.stripVPrefix);
}

/** Normalize a version string for comparison: lowercase, strip leading "v". */
export function normalizeVersion(v: string): string {
  return v.trim().replace(/^v/i, "").toLowerCase();
}
