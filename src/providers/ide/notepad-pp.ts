import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { win32 as winPath } from "node:path";
import { pickInstallHint } from "../../core/install-hint.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

interface NppPluginsListEntry {
  "folder-name"?: string;
  "display-name"?: string;
  version?: string;
  repository?: string;
}

interface NppPluginsList {
  "npp-plugins"?: NppPluginsListEntry[];
}

/**
 * Notepad++ plugins.
 *
 * Notepad++ ships a built-in Plugin Admin (Menu → Plugins → Plugins Admin)
 * with no CLI counterpart. We enumerate installed plugin folders from the
 * user-mode plugin path and the per-machine install path, then compare
 * names against the official `nppPluginList` JSON to surface the upstream
 * version. Installed version is unavailable without parsing the DLL
 * resource table (PE version info) — left as `?` since the actionable
 * value is the upstream "latest" and the Plugin Admin handles diffing.
 */
export class NotepadPpProvider implements Provider {
  readonly id = "notepad-pp";
  readonly displayName = "Notepad++ plugins";
  readonly installHint = pickInstallHint({
    win32: "Plugins → Plugins Admin (depuis Notepad++)",
    fallback: "Windows uniquement : Notepad++ n'existe pas sur cette plateforme.",
  });
  readonly slow = true;

  async isAvailable(): Promise<boolean> {
    if (process.platform !== "win32") return false;
    return pluginDirs().some((d) => existsSync(d));
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const installed = await listInstalledPluginNames();
    if (installed.size === 0) return [];

    const upstream = await fetchPluginIndex();
    if (!upstream) return [];

    const out: OutdatedPackage[] = [];
    for (const name of installed) {
      const entry = upstream.get(name.toLowerCase());
      if (!entry || !entry.version) continue;
      out.push({
        id: name,
        name: entry["display-name"] ?? name,
        current: "?",
        latest: entry.version,
        note: "auto-update via Plugins Admin",
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
      message: "Notepad++ → Plugins → Plugins Admin → Updates.",
    };
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    return packages.map((p) => ({
      id: p.id,
      success: false,
      skipped: true,
      message: "Update via Plugins Admin.",
    }));
  }
}

function pluginDirs(): string[] {
  const out: string[] = [];
  const localAppData = process.env["LOCALAPPDATA"];
  if (localAppData) {
    out.push(winPath.join(localAppData, "Notepad++", "plugins"));
  }
  for (const env of ["PROGRAMFILES", "PROGRAMFILES(X86)"]) {
    const base = process.env[env];
    if (base) out.push(winPath.join(base, "Notepad++", "plugins"));
  }
  return out;
}

async function listInstalledPluginNames(): Promise<Set<string>> {
  const names = new Set<string>();
  for (const dir of pluginDirs()) {
    if (!existsSync(dir)) continue;
    let entries: string[];
    try {
      entries = await readdir(dir, { withFileTypes: false });
    } catch {
      continue;
    }
    for (const entry of entries) {
      // Skip bundled config dirs ("Config", "APIs", "doc").
      if (entry.toLowerCase() === "config") continue;
      if (entry.toLowerCase() === "apis") continue;
      if (entry.toLowerCase() === "doc") continue;
      const dll = winPath.join(dir, entry, `${entry}.dll`);
      if (existsSync(dll)) names.add(entry);
    }
  }
  return names;
}

async function fetchPluginIndex(): Promise<Map<string, NppPluginsListEntry> | null> {
  try {
    // The signed list ships as a release asset (`pl.x64.json`), but the
    // raw JSON in HEAD is sufficient for read-only version comparison.
    const res = await fetch(
      "https://raw.githubusercontent.com/notepad-plus-plus/nppPluginList/HEAD/src/pl.x64.json",
      { signal: AbortSignal.timeout(8_000) },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as NppPluginsList;
    const list = data["npp-plugins"] ?? [];
    const map = new Map<string, NppPluginsListEntry>();
    for (const entry of list) {
      const key = entry["folder-name"];
      if (key) map.set(key.toLowerCase(), entry);
    }
    return map;
  } catch {
    return null;
  }
}
