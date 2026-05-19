import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

/**
 * Zed editor extensions.
 *
 * No stable public CLI for extension management (`zed --list-extensions`
 * doesn't exist as of writing). Zed itself auto-updates extensions in the
 * background, but a detect-only provider is still useful to surface the
 * inventory.
 *
 * Strategy: enumerate `<data>/extensions/installed/<name>/extension.toml`
 * (newer Zed) or `extension.json` (older), grab installed versions, mark
 * everything `manual: true` â€” Zed's own background updater is the source
 * of truth.
 */
export class ZedExtProvider implements Provider {
  readonly id = "zed-ext";
  readonly displayName = "Zed extensions";
  readonly installHint = "https://zed.dev/";

  async isAvailable(): Promise<boolean> {
    const dir = zedInstalledDir();
    return dir.length > 0 && existsSync(dir);
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const dir = zedInstalledDir();
    if (!existsSync(dir)) return [];

    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch {
      return [];
    }

    const out: OutdatedPackage[] = [];
    for (const entry of entries) {
      const version = await readExtensionVersion(join(dir, entry));
      if (!version) continue;
      out.push({
        id: entry,
        name: entry,
        current: version,
        latest: "?",
        note: "auto-update gÃ©rÃ© par Zed",
        manual: true,
      });
    }
    return out;
  }

  async update(packageId: string): Promise<UpdateOutcome> {
    return {
      id: packageId,
      success: false,
      skipped: true,
      message: "Mettre Ã  jour depuis Zed (zed: extensions).",
    };
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    return packages.map((p) => ({
      id: p.id,
      success: false,
      skipped: true,
      message: "Update via Zed.",
    }));
  }
}

function zedInstalledDir(): string {
  if (process.platform === "win32") {
    const local = process.env["LOCALAPPDATA"];
    return local ? join(local, "Zed", "extensions", "installed") : "";
  }
  if (process.platform === "darwin") {
    const home = process.env["HOME"];
    return home
      ? join(home, "Library", "Application Support", "Zed", "extensions", "installed")
      : "";
  }
  const xdg = process.env["XDG_DATA_HOME"];
  if (xdg) return join(xdg, "zed", "extensions", "installed");
  const home = process.env["HOME"];
  return home ? join(home, ".local", "share", "zed", "extensions", "installed") : "";
}

async function readExtensionVersion(dir: string): Promise<string | null> {
  const tomlPath = join(dir, "extension.toml");
  if (existsSync(tomlPath)) {
    try {
      const content = await readFile(tomlPath, "utf8");
      const match = content.match(/^\s*version\s*=\s*"([^"]+)"/m);
      if (match) return match[1] ?? null;
    } catch {
      /* fall through */
    }
  }
  const jsonPath = join(dir, "extension.json");
  if (existsSync(jsonPath)) {
    try {
      const data = JSON.parse(await readFile(jsonPath, "utf8")) as {
        version?: string;
      };
      return data.version ?? null;
    } catch {
      /* ignore */
    }
  }
  return null;
}
