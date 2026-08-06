import { readdir, readFile, realpath, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { posix as posixPath, win32 as winPath } from "node:path";
import pLimit from "p-limit";
import { pickInstallHint } from "../../core/install-hint.js";
import {
  runPmUpdate,
  describeSource,
  type InstallSource,
  type PackageIds,
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

    switch (target.source) {
      case "toolbox":
        return {
          id: packageId,
          success: false,
          skipped: true,
          message: "Géré par Toolbox — ouvrir Toolbox pour appliquer.",
        };
      case "scoop":
      case "choco":
      case "winget":
      // macOS: `brew upgrade --cask <token>` is the supported path for an IDE
      // installed with `brew install --cask`; runPmUpdate picks the cask form
      // as soon as packageIdsFor returns a brewCask token.
      case "brew":
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
          message: `Installation manuelle — https://www.jetbrains.com/${productSlug(target.productCode)}/download/`,
        };
    }
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    const outcomes: UpdateOutcome[] = [];
    for (const pkg of packages) outcomes.push(await this.update(pkg.id));
    return outcomes;
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
  let best: Omit<ProductInfo, "source"> | null = null;
  const maxDepth = maxWalkDepth();
  const pruneBundles = process.platform === "darwin";

  const queue: Array<{ path: string; depth: number }> = [
    { path: rootPath, depth: 0 },
  ];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const { path: current, depth } = queue.shift()!;
    if (visited.has(current) || depth > maxDepth) continue;
    visited.add(current);

    const candidate = joinPath(current, "product-info.json");
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
      if (pruneBundles && isPrunedBundleChild(current, child)) continue;
      const childPath = joinPath(current, child);
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

/**
 * Package IDs per package manager, keyed by JetBrains product code.
 * Mappings reflect the canonical names on each PM's repository.
 *
 * JetBrains ships every IDE as a Homebrew *cask*, never a formula, so the
 * macOS ids all go under `brewCask` (`brew upgrade --cask <token>`). AQ (Aqua)
 * has no verified cask token and is deliberately left without one.
 */
function packageIdsFor(productCode: string): PackageIds {
  const map: Record<string, PackageIds> = {
    IU: {
      winget: "JetBrains.IntelliJIDEA.Ultimate",
      scoop: "intellij-idea-ultimate",
      choco: "intellijidea-ultimate",
      brewCask: "intellij-idea",
    },
    IC: {
      winget: "JetBrains.IntelliJIDEA.Community",
      scoop: "intellij-idea",
      choco: "intellijidea-community",
      brewCask: "intellij-idea-ce",
    },
    WS: {
      winget: "JetBrains.WebStorm",
      scoop: "webstorm",
      choco: "webstorm",
      brewCask: "webstorm",
    },
    PS: {
      winget: "JetBrains.PhpStorm",
      scoop: "phpstorm",
      choco: "phpstorm",
      brewCask: "phpstorm",
    },
    PY: {
      winget: "JetBrains.PyCharm.Professional",
      scoop: "pycharm-professional",
      choco: "pycharm",
      brewCask: "pycharm",
    },
    PCP: {
      winget: "JetBrains.PyCharm.Professional",
      scoop: "pycharm-professional",
      choco: "pycharm",
      brewCask: "pycharm",
    },
    PC: {
      winget: "JetBrains.PyCharm.Community",
      scoop: "pycharm",
      choco: "pycharm-community",
      brewCask: "pycharm-ce",
    },
    PCC: {
      winget: "JetBrains.PyCharm.Community",
      scoop: "pycharm",
      choco: "pycharm-community",
      brewCask: "pycharm-ce",
    },
    GO: {
      winget: "JetBrains.GoLand",
      scoop: "goland",
      choco: "goland",
      brewCask: "goland",
    },
    RD: {
      winget: "JetBrains.Rider",
      scoop: "rider",
      choco: "jetbrains-rider",
      brewCask: "rider",
    },
    DB: {
      winget: "JetBrains.DataGrip",
      scoop: "datagrip",
      choco: "datagrip",
      brewCask: "datagrip",
    },
    DG: {
      winget: "JetBrains.DataGrip",
      scoop: "datagrip",
      choco: "datagrip",
      brewCask: "datagrip",
    },
    RM: {
      winget: "JetBrains.RubyMine",
      scoop: "rubymine",
      choco: "rubymine",
      brewCask: "rubymine",
    },
    CL: {
      winget: "JetBrains.CLion",
      scoop: "clion",
      choco: "clion",
      brewCask: "clion",
    },
    AQ: { winget: "JetBrains.Aqua", scoop: "aqua" },
    RR: {
      winget: "JetBrains.RustRover",
      scoop: "rustrover",
      brewCask: "rustrover",
    },
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
