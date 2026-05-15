import { readdir, readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import pLimit from "p-limit";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../core/types.js";

interface ProductInfo {
  name: string;
  version: string;
  buildNumber: string;
  productCode: string;
  installPath: string;
}

interface JetBrainsRelease {
  build: string;
  version: string;
  type: string;
}

/**
 * Detect-only provider. JetBrains Toolbox doesn't expose a reliable CLI
 * for triggering updates — Toolbox owns the install state and overwriting
 * it externally breaks the tracking. We surface outdated IDEs and let the
 * user update through Toolbox (which is one click).
 *
 * Scan strategy: walk `%LOCALAPPDATA%\JetBrains\Toolbox\apps\` and look
 * for `product-info.json` files (standard JetBrains IDE metadata),
 * then query data.services.jetbrains.com for the latest stable build.
 */
export class JetBrainsProvider implements Provider {
  readonly id = "jetbrains";
  readonly displayName = "JetBrains IDEs";
  readonly installHint = "JetBrains Toolbox: https://jb.gg/toolbox";

  async isAvailable(): Promise<boolean> {
    const dir = toolboxAppsDir();
    return dir.length > 0 && existsSync(dir);
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
          return {
            id: prod.productCode,
            name: prod.name,
            current: prod.version,
            latest: latest.version,
            note: "update via Toolbox",
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
      message: "Lancer JetBrains Toolbox pour appliquer la mise à jour.",
    };
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    return packages.map((p) => ({
      id: p.id,
      success: false,
      skipped: true,
      message: "Lancer JetBrains Toolbox.",
    }));
  }
}

function toolboxAppsDir(): string {
  const local = process.env["LOCALAPPDATA"];
  if (!local) return "";
  return join(local, "JetBrains", "Toolbox", "apps");
}

async function scanInstalledIDEs(): Promise<ProductInfo[]> {
  const appsDir = toolboxAppsDir();
  if (!appsDir) return [];

  let entries: string[];
  try {
    entries = await readdir(appsDir);
  } catch {
    return [];
  }

  const results: ProductInfo[] = [];
  for (const productDir of entries) {
    const info = await findLatestProductInfo(join(appsDir, productDir));
    if (info) results.push(info);
  }
  return results;
}

async function findLatestProductInfo(rootPath: string): Promise<ProductInfo | null> {
  let best: ProductInfo | null = null;

  const queue: Array<{ path: string; depth: number }> = [{ path: rootPath, depth: 0 }];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const { path: current, depth } = queue.shift()!;
    if (visited.has(current) || depth > 4) continue;
    visited.add(current);

    const candidate = join(current, "product-info.json");
    try {
      const raw = await readFile(candidate, "utf8");
      const parsed = JSON.parse(raw) as Partial<ProductInfo>;
      if (
        parsed.buildNumber &&
        parsed.productCode &&
        parsed.version &&
        parsed.name
      ) {
        const info: ProductInfo = {
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
      /* not here */
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

function compareBuilds(a: string, b: string): number {
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
