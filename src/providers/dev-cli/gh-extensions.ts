import pLimit from "p-limit";
import { commandExists, run, runInherit } from "../../core/runner.js";
import { pickInstallHint } from "../../core/install-hint.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

interface InstalledExt {
  name: string;
  repo: string;
  current: string;
}

/**
 * `gh extension list` has no JSON output. We parse the tabular view and
 * query each extension's GitHub repo for its latest release via `gh api`
 * (leverages existing auth — no rate limit pain).
 */
export class GhExtensionsProvider implements Provider {
  readonly id = "gh-ext";
  readonly displayName = "GitHub CLI extensions";
  readonly installHint = pickInstallHint({
    win32: "winget install GitHub.cli",
    fallback: "brew install gh",
  });
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
  return output
    .split(/\r?\n/)
    .map(parseGhExtLine)
    .filter((e): e is InstalledExt => e !== null);
}

/**
 * `gh extension list` prefixes the active extension with an asterisk and
 * interleaves headers and separators. null for anything that is not one.
 */
function parseGhExtLine(rawLine: string): InstalledExt | null {
  const line = rawLine.replace(/^\*\s*/, "").trim();
  if (!line || /^-+/.test(line)) return null;
  if (/^NAME\s+(REPO|VERSION)/i.test(line)) return null;

  const parts = line.split(/\s{2,}|\t+/);
  const [name, repo, version] = parts;
  if (!name || !repo || !/\S+\/\S+/.test(repo)) return null;

  return {
    name: name.trim(),
    repo: repo.trim(),
    current: (version ?? "").trim() || "?",
  };
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
