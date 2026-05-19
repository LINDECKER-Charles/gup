import pLimit from "p-limit";
import { commandExists, run, runInherit } from "../../core/runner.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

interface InstalledExt {
  name: string;
  repo: string;
  current: string;
}

/**
 * `gh extension list` has no JSON output. We parse the tabular view and
 * query each extension's GitHub repo for its latest release via `gh api`
 * (leverages existing auth â€” no rate limit pain).
 */
export class GhExtensionsProvider implements Provider {
  readonly id = "gh-ext";
  readonly displayName = "GitHub CLI extensions";
  readonly installHint = "winget install GitHub.cli";
  readonly slow = true;

  async isAvailable(): Promise<boolean> {
    return commandExists("gh");
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const { stdout } = await run("gh", ["extension", "list"]);
    const installed = parseGhExtList(stdout);
    if (installed.length === 0) return [];

    const limit = pLimit(6);
    const results = await Promise.all(
      installed.map((ext) =>
        limit(async (): Promise<OutdatedPackage | null> => {
          const latest = await fetchGhRepoLatest(ext.repo);
          if (!latest) return null;
          if (normalizeTag(latest) === normalizeTag(ext.current)) return null;
          return {
            id: ext.name,
            name: ext.name,
            current: ext.current,
            latest,
          };
        }),
      ),
    );
    return results.filter((r): r is OutdatedPackage => r !== null);
  }

  async update(packageId: string): Promise<UpdateOutcome> {
    const res = await runInherit("gh", ["extension", "upgrade", packageId]);
    return { id: packageId, success: !res.failed };
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    const res = await runInherit("gh", ["extension", "upgrade", "--all"]);
    return packages.map((p) => ({ id: p.id, success: !res.failed }));
  }
}

function parseGhExtList(output: string): InstalledExt[] {
  const out: InstalledExt[] = [];
  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.replace(/^\*\s*/, "").trim();
    if (!line) continue;
    if (/^NAME\s+(REPO|VERSION)/i.test(line)) continue;
    if (/^-+/.test(line)) continue;

    const parts = line.split(/\s{2,}|\t+/);
    if (parts.length < 2) continue;

    const [name, repo, version] = parts;
    if (!name || !repo || !/\S+\/\S+/.test(repo)) continue;

    out.push({
      name: name.trim(),
      repo: repo.trim(),
      current: (version ?? "").trim() || "?",
    });
  }
  return out;
}

async function fetchGhRepoLatest(repo: string): Promise<string | null> {
  const { stdout, failed } = await run("gh", [
    "api",
    `repos/${repo}/releases/latest`,
    "--jq",
    ".tag_name",
  ]);
  if (failed) return null;
  const tag = stdout.trim();
  return tag.length > 0 ? tag : null;
}

function normalizeTag(tag: string): string {
  return tag.trim().replace(/^v/, "").toLowerCase();
}
