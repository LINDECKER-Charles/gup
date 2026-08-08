import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { posix as posixPath, win32 as winPath } from "node:path";
import pLimit from "p-limit";
import { fetchGitHubReleaseLatest } from "../../core/gh-releases.js";
import { pickInstallHint } from "../../core/install-hint.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

interface InstalledPlugin {
  id: string;
  current: string;
  vault: string;
}

/**
 * Obsidian community plugins. Detect-only: Obsidian replaces plugin files
 * (`main.js`, `manifest.json`, `styles.css`) from its in-app updater — no
 * CLI surface. Strategy:
 *   1. Parse `%APPDATA%\obsidian\obsidian.json` (the Hub config) for vault
 *      paths.
 *   2. For each vault, enumerate `.obsidian/plugins/<id>/manifest.json`.
 *   3. Hit the community-plugins index once to map id → GitHub repo.
 *   4. Query each matching repo's `releases/latest` for the upstream tag.
 *
 * Plugins not present in the official index (custom forks) are dropped
 * silently — there is no reliable upstream signal for them.
 */
export class ObsidianPluginsProvider implements Provider {
  readonly id = "obsidian-plugins";
  readonly displayName = "Obsidian plugins";
  readonly installHint = pickInstallHint({
    win32: "https://obsidian.md/",
    darwin: "brew install --cask obsidian",
    fallback: "https://obsidian.md/",
  });
  readonly slow = true;

  async isAvailable(): Promise<boolean> {
    return existsSync(obsidianConfigFile());
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const vaults = await listObsidianVaults();
    if (vaults.length === 0) return [];

    const installed = await collectVaultPlugins(vaults);
    if (installed.size === 0) return [];

    const index = await fetchCommunityIndex();
    if (!index) return [];

    const limit = pLimit(4);
    const results = await Promise.all(
      Array.from(installed.values()).map((p) =>
        limit(async (): Promise<OutdatedPackage | null> => {
          const repo = index.get(p.id);
          if (!repo) return null;
          const latest = await fetchGitHubReleaseLatest(repo);
          if (!latest || latest === p.current) return null;
          return {
            id: p.id,
            name: p.id,
            current: p.current,
            latest,
            note: `vault: ${vaultPath().basename(p.vault)}`,
            manual: true,
          };
        }),
      ),
    );
    return results.filter((r): r is OutdatedPackage => r !== null);
  }

  async update(packageId: string): Promise<UpdateOutcome> {
    return {
      id: packageId,
      success: false,
      skipped: true,
      message:
        "Mettre à jour depuis Obsidian → Settings → Community plugins → Check for updates.",
    };
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    return packages.map((p) => ({
      id: p.id,
      success: false,
      skipped: true,
      message: "Update via Obsidian.",
    }));
  }
}

/**
 * Vaults live on the *target* OS, so the separator follows `process.platform`
 * rather than the host `path` default — otherwise a win32-mocked unit test
 * only produces `C:\…` paths when the runner itself is Windows.
 */
function vaultPath(): typeof winPath {
  return process.platform === "win32" ? winPath : posixPath;
}

function obsidianConfigFile(): string {
  if (process.platform === "win32") {
    const appdata = process.env["APPDATA"];
    return appdata ? winPath.join(appdata, "obsidian", "obsidian.json") : "";
  }
  if (process.platform === "darwin") {
    const home = process.env["HOME"];
    return home
      ? posixPath.join(home, "Library", "Application Support", "obsidian", "obsidian.json")
      : "";
  }
  const xdg = process.env["XDG_CONFIG_HOME"];
  if (xdg) return posixPath.join(xdg, "obsidian", "obsidian.json");
  const home = process.env["HOME"];
  return home ? posixPath.join(home, ".config", "obsidian", "obsidian.json") : "";
}

async function listObsidianVaults(): Promise<string[]> {
  const cfg = obsidianConfigFile();
  if (!existsSync(cfg)) return [];
  try {
    const data = JSON.parse(await readFile(cfg, "utf8")) as {
      vaults?: Record<string, { path?: string; open?: boolean }>;
    };
    if (!data.vaults) return [];
    return Object.values(data.vaults)
      .map((v) => v.path)
      .filter((p): p is string => typeof p === "string" && p.length > 0)
      .filter((p) => existsSync(p));
  } catch {
    return [];
  }
}

async function scanVaultPlugins(vault: string): Promise<InstalledPlugin[]> {
  const p = vaultPath();
  const dir = p.join(vault, ".obsidian", "plugins");
  if (!existsSync(dir)) return [];
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }
  const out: InstalledPlugin[] = [];
  for (const entry of entries) {
    const manifestPath = p.join(dir, entry, "manifest.json");
    if (!existsSync(manifestPath)) continue;
    try {
      const m = JSON.parse(await readFile(manifestPath, "utf8")) as {
        id?: string;
        version?: string;
      };
      if (m.id && m.version) {
        out.push({ id: m.id, current: m.version, vault });
      }
    } catch {
      /* skip malformed manifest */
    }
  }
  return out;
}

async function fetchCommunityIndex(): Promise<Map<string, string> | null> {
  try {
    const res = await fetch(
      "https://raw.githubusercontent.com/obsidianmd/obsidian-releases/HEAD/community-plugins.json",
      { signal: AbortSignal.timeout(8_000) },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as Array<{ id?: string; repo?: string }>;
    const map = new Map<string, string>();
    for (const entry of data) {
      if (entry.id && entry.repo) map.set(entry.id, entry.repo);
    }
    return map;
  } catch {
    return null;
  }
}

/**
 * Plugins across every vault, deduped by id: the first vault carrying a plugin
 * wins, later ones do not overwrite its version.
 */
async function collectVaultPlugins(
  vaults: string[],
): Promise<Map<string, InstalledPlugin>> {
  const installed = new Map<string, InstalledPlugin>();
  for (const vault of vaults) {
    for (const p of await scanVaultPlugins(vault)) {
      if (!installed.has(p.id)) installed.set(p.id, p);
    }
  }
  return installed;
}
