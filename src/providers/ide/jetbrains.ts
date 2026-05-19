import { readdir, readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import pLimit from "p-limit";
import { runPmUpdate, describeSource, type InstallSource } from "../../core/install-source.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

interface ProductInfo {
  name: string;
  version: string;
  buildNumber: string;
  productCode: string;
  installPath: string;
  source: InstallSource | "toolbox";
}

interface JetBrainsRelease {
  build: string;
  version: string;
  type: string;
}

/**
 * JetBrains IDEs are installable through multiple channels: Toolbox,
 * winget, scoop, choco, or a manual installer. We scan all of them and
 * route the update accordingly:
 *
 *  - toolbox: skipped (Toolbox owns the install state; bypassing it
 *    leaves Toolbox out of sync and breaks the auto-update UI).
 *  - winget/scoop/choco: delegate to the source PM.
 *  - manual: skipped with a download URL.
 */
export class JetBrainsProvider implements Provider {
  readonly id = "jetbrains";
  readonly displayName = "JetBrains IDEs";
  readonly installHint = "JetBrains Toolbox: https://jb.gg/toolbox";
  readonly slow = true;

  async isAvailable(): Promise<boolean> {
    const roots = candidateRoots();
    return roots.some((dir) => existsSync(dir));
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const installed = await scanInstalledIDEs();
    if (installed.length === 0) return [];

    const limit = pLimit(4);
    const results = await Promise.all(
      installed.map((prod) =>
        limit(async (): Promise<OutdatedPackage | null> => {
          const latest = await fetchJetBrainsLatest(prod.productCode);
          if (!latest) return null;
          if (compareBuilds(prod.buildNumber, latest.build) >= 0) return null;
          const isManual = prod.source === "toolbox" || prod.source === "manual";
          return {
            id: prod.productCode,
            name: prod.name,
            current: prod.version,
            latest: latest.version,
            note:
              prod.source === "toolbox"
                ? "via Toolbox"
                : describeSource(prod.source),
            ...(isManual && { manual: true }),
          };
        }),
      ),
    );
    return results.filter((r): r is OutdatedPackage => r !== null);
  }

  async update(packageId: string): Promise<UpdateOutcome> {
    const installed = await scanInstalledIDEs();
    const target = installed.find((p) => p.productCode === packageId);
    if (!target) {
      return {
        id: packageId,
        success: false,
        message: `IDE ${packageId} introuvable â€” re-scanner ?`,
      };
    }

    switch (target.source) {
      case "toolbox":
        return {
          id: packageId,
          success: false,
          skipped: true,
          message: "GÃ©rÃ© par Toolbox â€” ouvrir Toolbox pour appliquer.",
        };
      case "scoop":
      case "choco":
      case "winget":
        return runPmUpdate(
          packageId,
          target.source,
          packageIdsFor(target.productCode),
          `Pas de mapping ${target.source} pour ${target.productCode}.`,
        );
      case "manual":
      default:
        return {
          id: packageId,
          success: false,
          skipped: true,
          message: `Installation manuelle â€” https://www.jetbrains.com/${productSlug(target.productCode)}/download/`,
        };
    }
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    const outcomes: UpdateOutcome[] = [];
    for (const pkg of packages) outcomes.push(await this.update(pkg.id));
    return outcomes;
  }
}

function candidateRoots(): string[] {
  const local = process.env["LOCALAPPDATA"] ?? "";
  const userProfile = process.env["USERPROFILE"] ?? "";
  return [
    local && join(local, "JetBrains", "Toolbox", "apps"),
    "C:\\Program Files\\JetBrains",
    "C:\\Program Files (x86)\\JetBrains",
    local && join(local, "Programs"),
    userProfile && join(userProfile, "scoop", "apps"),
  ].filter(Boolean);
}

async function scanInstalledIDEs(): Promise<ProductInfo[]> {
  const seen = new Map<string, ProductInfo>();
  for (const root of candidateRoots()) {
    if (!existsSync(root)) continue;
    let entries: string[];
    try {
      entries = await readdir(root);
    } catch {
      continue;
    }
    for (const entry of entries) {
      const productDir = join(root, entry);
      const info = await findLatestProductInfo(productDir);
      if (!info) continue;
      const source = detectSourceFromPath(info.installPath);
      // For a given product code, prefer the newest installed build across roots.
      const existing = seen.get(info.productCode);
      if (!existing || compareBuilds(info.buildNumber, existing.buildNumber) > 0) {
        seen.set(info.productCode, { ...info, source });
      }
    }
  }
  return Array.from(seen.values());
}

async function findLatestProductInfo(
  rootPath: string,
): Promise<Omit<ProductInfo, "source"> | null> {
  let best: Omit<ProductInfo, "source"> | null = null;

  const queue: Array<{ path: string; depth: number }> = [
    { path: rootPath, depth: 0 },
  ];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const { path: current, depth } = queue.shift()!;
    if (visited.has(current) || depth > 4) continue;
    visited.add(current);

    const candidate = join(current, "product-info.json");
    try {
      const raw = await readFile(candidate, "utf8");
      const parsed = JSON.parse(raw) as Partial<
        Omit<ProductInfo, "installPath" | "source">
      >;
      if (
        parsed.buildNumber &&
        parsed.productCode &&
        parsed.version &&
        parsed.name
      ) {
        const info: Omit<ProductInfo, "source"> = {
          name: parsed.name,
          version: parsed.version,
          buildNumber: parsed.buildNumber,
          productCode: parsed.productCode,
          installPath: current,
        };
        if (!best || compareBuilds(info.buildNumber, best.buildNumber) > 0) {
          best = info;
        }
      }
    } catch {
      /* no product-info.json here */
    }

    let children: string[];
    try {
      children = await readdir(current);
    } catch {
      continue;
    }
    for (const child of children) {
      const childPath = join(current, child);
      try {
        const s = await stat(childPath);
        if (s.isDirectory()) queue.push({ path: childPath, depth: depth + 1 });
      } catch {
        /* skip */
      }
    }
  }

  return best;
}

export function detectSourceFromPath(installPath: string): ProductInfo["source"] {
  const lower = installPath.toLowerCase();
  if (lower.includes("\\jetbrains\\toolbox\\apps\\")) return "toolbox";
  if (lower.includes("\\scoop\\apps\\")) return "scoop";
  if (lower.includes("chocolatey")) return "choco";
  if (
    lower.includes("\\winget\\packages\\") ||
    lower.includes("\\appdata\\local\\programs\\")
  )
    return "winget";
  return "manual";
}

export function compareBuilds(a: string, b: string): number {
  if (!a) return -1;
  if (!b) return 1;
  const aParts = a.split(".").map((p) => parseInt(p, 10) || 0);
  const bParts = b.split(".").map((p) => parseInt(p, 10) || 0);
  const len = Math.max(aParts.length, bParts.length);
  for (let i = 0; i < len; i++) {
    const ai = aParts[i] ?? 0;
    const bi = bParts[i] ?? 0;
    if (ai !== bi) return ai - bi;
  }
  return 0;
}

async function fetchJetBrainsLatest(productCode: string): Promise<JetBrainsRelease | null> {
  try {
    const url = `https://data.services.jetbrains.com/products/releases?code=${encodeURIComponent(
      productCode,
    )}&latest=true&type=release`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5_000) });
    if (!res.ok) return null;
    const data = (await res.json()) as Record<string, JetBrainsRelease[]>;
    return data[productCode]?.[0] ?? null;
  } catch {
    return null;
  }
}

/**
 * Package IDs per package manager, keyed by JetBrains product code.
 * Mappings reflect the canonical names on each PM's repository.
 */
function packageIdsFor(productCode: string): {
  winget?: string;
  scoop?: string;
  choco?: string;
} {
  const map: Record<string, { winget?: string; scoop?: string; choco?: string }> = {
    IU: {
      winget: "JetBrains.IntelliJIDEA.Ultimate",
      scoop: "intellij-idea-ultimate",
      choco: "intellijidea-ultimate",
    },
    IC: {
      winget: "JetBrains.IntelliJIDEA.Community",
      scoop: "intellij-idea",
      choco: "intellijidea-community",
    },
    WS: { winget: "JetBrains.WebStorm", scoop: "webstorm", choco: "webstorm" },
    PS: { winget: "JetBrains.PhpStorm", scoop: "phpstorm", choco: "phpstorm" },
    PY: {
      winget: "JetBrains.PyCharm.Professional",
      scoop: "pycharm-professional",
      choco: "pycharm",
    },
    PCP: {
      winget: "JetBrains.PyCharm.Professional",
      scoop: "pycharm-professional",
      choco: "pycharm",
    },
    PC: {
      winget: "JetBrains.PyCharm.Community",
      scoop: "pycharm",
      choco: "pycharm-community",
    },
    PCC: {
      winget: "JetBrains.PyCharm.Community",
      scoop: "pycharm",
      choco: "pycharm-community",
    },
    GO: { winget: "JetBrains.GoLand", scoop: "goland", choco: "goland" },
    RD: {
      winget: "JetBrains.Rider",
      scoop: "rider",
      choco: "jetbrains-rider",
    },
    DB: { winget: "JetBrains.DataGrip", scoop: "datagrip", choco: "datagrip" },
    DG: { winget: "JetBrains.DataGrip", scoop: "datagrip", choco: "datagrip" },
    RM: { winget: "JetBrains.RubyMine", scoop: "rubymine", choco: "rubymine" },
    CL: { winget: "JetBrains.CLion", scoop: "clion", choco: "clion" },
    AQ: { winget: "JetBrains.Aqua", scoop: "aqua" },
    RR: { winget: "JetBrains.RustRover", scoop: "rustrover" },
  };
  return map[productCode] ?? {};
}

function productSlug(productCode: string): string {
  const map: Record<string, string> = {
    IU: "idea",
    IC: "idea",
    WS: "webstorm",
    PS: "phpstorm",
    PY: "pycharm",
    PCP: "pycharm",
    PC: "pycharm",
    PCC: "pycharm",
    GO: "go",
    RD: "rider",
    DB: "datagrip",
    DG: "datagrip",
    RM: "ruby",
    CL: "clion",
    AQ: "aqua",
    RR: "rust",
  };
  return map[productCode] ?? "products";
}
