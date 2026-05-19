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

/**
 * Fetch the `tag_name` of the latest GitHub release for `<owner>/<repo>`.
 * Returns null on network/HTTP errors so callers can degrade gracefully.
 */
export async function fetchGitHubReleaseLatest(
  ownerRepo: string,
  options: FetchLatestOptions = {},
): Promise<string | null> {
  const { stripVPrefix = true, timeoutMs = 5_000 } = options;
  try {
    const res = await fetch(
      `https://api.github.com/repos/${ownerRepo}/releases/latest`,
      {
        headers: { accept: "application/vnd.github+json" },
        signal: AbortSignal.timeout(timeoutMs),
      },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as GitHubReleaseJson;
    const tag = data.tag_name ?? data.name ?? null;
    if (!tag) return null;
    return stripVPrefix ? tag.replace(/^v/, "") : tag;
  } catch {
    return null;
  }
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
  const { stripVPrefix = true, timeoutMs = 5_000, perPage = 30 } = options;
  try {
    const res = await fetch(
      `https://api.github.com/repos/${ownerRepo}/releases?per_page=${perPage}`,
      {
        headers: { accept: "application/vnd.github+json" },
        signal: AbortSignal.timeout(timeoutMs),
      },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as GitHubReleaseJson[];
    for (const release of data) {
      const tag = release.tag_name;
      if (!tag) continue;
      if (predicate(tag)) {
        return stripVPrefix ? tag.replace(/^v/, "") : tag;
      }
    }
    return null;
  } catch {
    return null;
  }
}

/** Normalize a version string for comparison: lowercase, strip leading "v". */
export function normalizeVersion(v: string): string {
  return v.trim().replace(/^v/i, "").toLowerCase();
}
