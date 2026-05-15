import { readdir, readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import AdmZip from "adm-zip";
import pLimit from "p-limit";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../core/types.js";

interface PluginMeta {
  id: string;
  name: string;
  version: string;
  ideHosts: string[];
}

/**
 * Plugins installed manually in JetBrains IDEs (i.e. under the user config
 * dir, not bundled with the IDE itself). Detect-only: updates flow through
 * the IDE's plugin manager — we can't safely replace JARs without breaking
 * the IDE's tracking.
 *
 * Scan strategy: enumerate `%APPDATA%\JetBrains\<ProductDirYYYY.X>\plugins`,
 * extract metadata from each plugin's `META-INF/plugin.xml` (sometimes
 * embedded in a JAR), query the JetBrains marketplace XML listing for the
 * latest stable version.
 */
export class JetBrainsPluginsProvider implements Provider {
  readonly id = "jetbrains-plugins";
  readonly displayName = "JetBrains plugins";
  readonly installHint = "Auto-installés depuis l'IDE (Settings → Plugins)";
  readonly slow = true;

  async isAvailable(): Promise<boolean> {
    const dir = jetbrainsConfigRoot();
    return dir.length > 0 && existsSync(dir);
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const allPlugins = await scanAllPlugins();
    if (allPlugins.length === 0) return [];

    // Dedupe: same plugin installed in multiple IDEs — keep the oldest
    // version (an update there helps everyone) and merge ideHosts.
    const byId = new Map<string, PluginMeta>();
    for (const plugin of allPlugins) {
      const existing = byId.get(plugin.id);
      if (!existing) {
        byId.set(plugin.id, { ...plugin });
        continue;
      }
      for (const host of plugin.ideHosts) {
        if (!existing.ideHosts.includes(host)) existing.ideHosts.push(host);
      }
      if (compareVersions(plugin.version, existing.version) < 0) {
        existing.version = plugin.version;
      }
    }

    const limit = pLimit(4);
    const results = await Promise.all(
      Array.from(byId.values()).map((plugin) =>
        limit(async (): Promise<OutdatedPackage | null> => {
          const latest = await fetchLatestPluginVersion(plugin.id);
          if (!latest) return null;
          if (compareVersions(plugin.version, latest) >= 0) return null;
          return {
            id: plugin.id,
            name: plugin.name,
            current: plugin.version,
            latest,
            note: plugin.ideHosts.join(", "),
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
      message: "Settings → Plugins → Updates (depuis l'IDE concerné).",
    };
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    return packages.map((p) => ({
      id: p.id,
      success: false,
      skipped: true,
      message: "Update via l'IDE.",
    }));
  }
}

function jetbrainsConfigRoot(): string {
  const appdata = process.env["APPDATA"];
  if (!appdata) return "";
  return join(appdata, "JetBrains");
}

async function scanAllPlugins(): Promise<PluginMeta[]> {
  const root = jetbrainsConfigRoot();
  if (!root) return [];

  let ides: string[];
  try {
    ides = await readdir(root);
  } catch {
    return [];
  }

  const out: PluginMeta[] = [];
  for (const ide of ides) {
    if (!/^[A-Za-z]+\d{4}\.\d+$/.test(ide)) continue;
    const pluginsDir = join(root, ide, "plugins");
    if (!existsSync(pluginsDir)) continue;

    const plugins = await scanIdeDir(pluginsDir, shortenIdeName(ide));
    out.push(...plugins);
  }
  return out;
}

async function scanIdeDir(dir: string, ideHost: string): Promise<PluginMeta[]> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }

  const out: PluginMeta[] = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    let info;
    try {
      info = await stat(fullPath);
    } catch {
      continue;
    }

    let meta: { id: string; name: string; version: string } | null = null;
    if (info.isDirectory()) {
      meta = await extractFromPluginDir(fullPath);
    } else if (entry.toLowerCase().endsWith(".jar")) {
      meta = extractFromJar(fullPath);
    }

    if (meta) out.push({ ...meta, ideHosts: [ideHost] });
  }
  return out;
}

async function extractFromPluginDir(
  dir: string,
): Promise<{ id: string; name: string; version: string } | null> {
  const direct = join(dir, "META-INF", "plugin.xml");
  if (existsSync(direct)) {
    try {
      const content = await readFile(direct, "utf8");
      const parsed = parsePluginXml(content);
      if (parsed) return parsed;
    } catch {
      /* fall through */
    }
  }

  const libDir = join(dir, "lib");
  if (!existsSync(libDir)) return null;

  let jars: string[];
  try {
    jars = (await readdir(libDir)).filter((f) => f.toLowerCase().endsWith(".jar"));
  } catch {
    return null;
  }
  for (const jar of jars) {
    const meta = extractFromJar(join(libDir, jar));
    if (meta) return meta;
  }
  return null;
}

function extractFromJar(
  jarPath: string,
): { id: string; name: string; version: string } | null {
  try {
    const zip = new AdmZip(jarPath);
    const entry = zip.getEntry("META-INF/plugin.xml");
    if (!entry) return null;
    const content = entry.getData().toString("utf8");
    return parsePluginXml(content);
  } catch {
    return null;
  }
}

function parsePluginXml(
  xml: string,
): { id: string; name: string; version: string } | null {
  const idMatch = xml.match(/<id>([^<]+)<\/id>/);
  const nameMatch = xml.match(/<name>([^<]+)<\/name>/);
  const versionMatch = xml.match(/<version>([^<]+)<\/version>/);
  const id = idMatch?.[1]?.trim();
  const version = versionMatch?.[1]?.trim();
  if (!id || !version) return null;
  return {
    id,
    name: nameMatch?.[1]?.trim() ?? id,
    version,
  };
}

function compareVersions(a: string, b: string): number {
  const partsA = a.split(/[.\-]/).map((p) => parseInt(p, 10) || 0);
  const partsB = b.split(/[.\-]/).map((p) => parseInt(p, 10) || 0);
  const len = Math.max(partsA.length, partsB.length);
  for (let i = 0; i < len; i++) {
    const ai = partsA[i] ?? 0;
    const bi = partsB[i] ?? 0;
    if (ai !== bi) return ai - bi;
  }
  return 0;
}

function shortenIdeName(productDir: string): string {
  const match = productDir.match(/^([A-Za-z]+)\d{4}\.\d+$/);
  const base = match?.[1] ?? productDir;
  const map: Record<string, string> = {
    IntelliJIdea: "IDEA",
    IdeaIC: "IDEA-CE",
    PhpStorm: "PhpStorm",
    WebStorm: "WebStorm",
    PyCharm: "PyCharm",
    PyCharmCE: "PyCharm-CE",
    GoLand: "GoLand",
    Rider: "Rider",
    RubyMine: "RubyMine",
    CLion: "CLion",
    DataGrip: "DataGrip",
    RustRover: "RustRover",
    Aqua: "Aqua",
    Writerside: "Writerside",
  };
  return map[base] ?? base;
}

async function fetchLatestPluginVersion(xmlId: string): Promise<string | null> {
  try {
    const url = `https://plugins.jetbrains.com/plugins/list?pluginId=${encodeURIComponent(xmlId)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5_000) });
    if (!res.ok) return null;
    const text = await res.text();
    const match = text.match(/<version>([^<]+)<\/version>/);
    return match?.[1]?.trim() ?? null;
  } catch {
    return null;
  }
}
