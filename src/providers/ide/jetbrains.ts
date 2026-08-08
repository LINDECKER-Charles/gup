import { readdir, readFile, realpath, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { posix as posixPath, win32 as winPath } from "node:path";
import pLimit from "p-limit";
import { pickInstallHint } from "../../core/install-hint.js";
import { packageIdsFor, productSlug } from "./jetbrains-catalog.js";
import {
  runPmUpdate,
  describeSource,
  type InstallSource,
} from "../../core/install-source.js";
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
 * winget, scoop, choco, brew cask, or a manual installer. We scan all of
 * them and route the update accordingly:
 *
 *  - toolbox: skipped (Toolbox owns the install state; bypassing it
 *    leaves Toolbox out of sync and breaks the auto-update UI).
 *  - winget/scoop/choco/brew: delegate to the source PM.
 *  - manual: skipped with a download URL.
 */
export class JetBrainsProvider implements Provider {
  readonly id = "jetbrains";
  readonly displayName = "JetBrains IDEs";
  readonly installHint = pickInstallHint({
    win32: "JetBrains Toolbox: https://jb.gg/toolbox",
    darwin: "brew install --cask jetbrains-toolbox",
    fallback: "JetBrains Toolbox: https://jb.gg/toolbox",
  });
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
        message: `IDE ${packageId} introuvable — re-scanner ?`,
      };
    }
    return updateBySource(target);
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    const outcomes: UpdateOutcome[] = [];
    for (const pkg of packages) outcomes.push(await this.update(pkg.id));
    return outcomes;
  }
}

const TOOLBOX_SKIP = "Géré par Toolbox — ouvrir Toolbox pour appliquer.";
const JETBRAINS_SITE = "https://www.jetbrains.com";

/** Route the update to whichever channel actually owns the install. */
async function updateBySource(target: ProductInfo): Promise<UpdateOutcome> {
  const id = target.productCode;
  switch (target.source) {
    case "toolbox":
      return { id, success: false, skipped: true, message: TOOLBOX_SKIP };
    case "scoop":
    case "choco":
    case "winget":
    // macOS: `brew upgrade --cask <token>` is the supported path for an IDE
    // installed with `brew install --cask`; runPmUpdate picks the cask form
    // as soon as packageIdsFor returns a brewCask token.
    case "brew":
      return runPmUpdate(
        id,
        target.source,
        packageIdsFor(id),
        `Pas de mapping ${target.source} pour ${id}.`,
      );
    case "manual":
    default:
      return {
        id,
        success: false,
        skipped: true,
        message: `Installation manuelle — ${JETBRAINS_SITE}/${productSlug(id)}/download/`,
      };
  }
}

/**
 * Join with the separator of the running OS rather than the host's — the two
 * differ under test, where `process.platform` is forced to "win32" on a POSIX
 * box and a bare `join()` would emit "/" where the asserted `C:\…` roots need
 * "\".
 *
 * Keyed on win32 specifically, not on "not darwin": gup running inside WSL is
 * a Linux process that may still see `LOCALAPPDATA` (WSLENV translates it to
 * `/mnt/c/Users/…`), and joining that with backslashes would produce a path
 * that resolves nowhere.
 */
function joinPath(...parts: string[]): string {
  return process.platform === "win32"
    ? winPath.join(...parts)
    : posixPath.join(...parts);
}

function candidateRoots(): string[] {
  if (process.platform === "darwin") return darwinRoots();
  const local = process.env["LOCALAPPDATA"] ?? "";
  const userProfile = process.env["USERPROFILE"] ?? "";
  return [
    local && joinPath(local, "JetBrains", "Toolbox", "apps"),
    "C:\\Program Files\\JetBrains",
    "C:\\Program Files (x86)\\JetBrains",
    local && joinPath(local, "Programs"),
    userProfile && joinPath(userProfile, "scoop", "apps"),
  ].filter(Boolean);
}

/**
 * macOS install locations. `/Applications` and `~/Applications` cover both a
 * DMG drag-and-drop and a `brew install --cask` (Homebrew moves the bundle
 * there); Toolbox stores its own copies under the user Application Support
 * tree, the counterpart of %LOCALAPPDATA%\JetBrains\Toolbox\apps.
 */
function darwinRoots(): string[] {
  const home = process.env["HOME"] ?? "";
  return [
    "/Applications",
    home && posixPath.join(home, "Applications"),
    home &&
      posixPath.join(
        home,
        "Library",
        "Application Support",
        "JetBrains",
        "Toolbox",
        "apps",
      ),
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
      const productDir = joinPath(root, entry);
      const info = await findLatestProductInfo(productDir);
      if (!info) continue;
      const source = detectSourceFromPath(
        await resolveForSourceDetection(info.installPath),
      );
      // For a given product code, prefer the newest installed build across roots.
      const existing = seen.get(info.productCode);
      if (!existing || compareBuilds(info.buildNumber, existing.buildNumber) > 0) {
        seen.set(info.productCode, { ...info, source });
      }
    }
  }
  return Array.from(seen.values());
}

/**
 * macOS keeps an IDE in a symlink-heavy layout: a cask install can leave
 * `/Applications/<X>.app` pointing into the Homebrew Caskroom, and the literal
 * path then hides who owns the install. Resolving it before classification is
 * the same trick core/install-source.ts uses for Homebrew shims. Returns the
 * input untouched on any other platform, so win32 keeps its path-only match.
 */
async function resolveForSourceDetection(installPath: string): Promise<string> {
  if (process.platform !== "darwin") return installPath;
  try {
    return await realpath(installPath);
  } catch {
    return installPath;
  }
}

/**
 * Walk budget, counted from a product directory.
 *
 * Windows keeps the historical 4: a Toolbox install exposes the manifest at
 * `<Product>\ch-0\<build>\product-info.json` (depth 2), Program Files and
 * scoop installs at depth 0-1.
 *
 * macOS needs one more level, because an IDE is an `.app` bundle whose
 * manifest lives at `<X>.app/Contents/Resources/product-info.json` — two extra
 * levels on top of the layout above. The deepest real case is a legacy Toolbox
 * install, `<Product>/ch-0/<build>/<X>.app/Contents/Resources`, i.e. depth 5.
 */
function maxWalkDepth(): number {
  return process.platform === "darwin" ? 5 : 4;
}

/**
 * macOS only: inside an `.app` bundle the sole path worth following is
 * `Contents/Resources`. Without this guard, scanning `/Applications` would
 * descend through every unrelated bundle installed there (Xcode alone is tens
 * of thousands of directories) to find nothing. No Windows install path ever
 * contains a `.app` segment, so the win32 walk is unchanged.
 */
function isPrunedBundleChild(current: string, child: string): boolean {
  const segments = current.split("/");
  const appIndex = segments.findIndex((s) => s.toLowerCase().endsWith(".app"));
  if (appIndex < 0) return false;
  const inside = segments.slice(appIndex + 1);
  if (inside.length === 0) return child !== "Contents";
  if (inside.length === 1 && inside[0] === "Contents")
    return child !== "Resources";
  return true;
}

async function findLatestProductInfo(
  rootPath: string,
): Promise<Omit<ProductInfo, "source"> | null> {
  const maxDepth = maxWalkDepth();
  const queue: Array<{ path: string; depth: number }> = [
    { path: rootPath, depth: 0 },
  ];
  const visited = new Set<string>();
  let best: Omit<ProductInfo, "source"> | null = null;

  while (queue.length > 0) {
    const { path: current, depth } = queue.shift()!;
    if (visited.has(current) || depth > maxDepth) continue;
    visited.add(current);

    const info = await readProductInfo(current);
    if (info && (!best || compareBuilds(info.buildNumber, best.buildNumber) > 0)) {
      best = info;
    }

    for (const child of await childDirectories(current)) {
      queue.push({ path: child, depth: depth + 1 });
    }
  }

  return best;
}

/** Read `dir`'s `product-info.json`, or null when missing or incomplete. */
async function readProductInfo(
  dir: string,
): Promise<Omit<ProductInfo, "source"> | null> {
  try {
    const raw = await readFile(joinPath(dir, "product-info.json"), "utf8");
    const parsed = JSON.parse(raw) as Partial<
      Omit<ProductInfo, "installPath" | "source">
    >;
    const { name, version, buildNumber, productCode } = parsed;
    if (!name || !version || !buildNumber || !productCode) return null;
    return { name, version, buildNumber, productCode, installPath: dir };
  } catch {
    return null; /* pas de product-info.json lisible ici */
  }
}

/**
 * Direct subdirectories of `dir`, macOS bundles pruned. An unreadable
 * directory (permission, broken link) is skipped rather than failing the scan.
 */
async function childDirectories(dir: string): Promise<string[]> {
  const pruneBundles = process.platform === "darwin";
  let children: string[];
  try {
    children = await readdir(dir);
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const child of children) {
    if (pruneBundles && isPrunedBundleChild(dir, child)) continue;
    const childPath = joinPath(dir, child);
    if (await isDirectory(childPath)) out.push(childPath);
  }
  return out;
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
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
  // macOS: Toolbox stores its apps under the user Application Support tree,
  // and a cask install physically lives in the Homebrew Caskroom (whatever the
  // prefix: /opt/homebrew, /usr/local). Both patterns use forward slashes, so
  // no Windows path can ever reach them.
  if (lower.includes("/library/application support/jetbrains/toolbox/apps/"))
    return "toolbox";
  if (lower.includes("/caskroom/")) return "brew";
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
