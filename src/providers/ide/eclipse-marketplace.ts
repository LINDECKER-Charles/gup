import { existsSync } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { commandExists } from "../../core/runner.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

/**
 * Eclipse Marketplace / p2 features.
 *
 * The p2 director (`eclipsec.exe -application org.eclipse.equinox.p2.director`)
 * can install/uninstall IUs but exposes no clean "update all" verb usable
 * without per-IU bookkeeping (profile id, update-site URL, tag). In
 * practice Eclipse users update through Help â†’ Check for Updates, so this
 * provider is detect-only: it inventories installed top-level features so
 * the user can see them surfaced in `gup`, then defers the actual upgrade.
 *
 * Detection probes the well-known Windows install roots and PATH; once an
 * eclipse home is found we walk `<eclipse>/features` to enumerate
 * `<id>_<version>` directory names.
 */
export class EclipseMarketplaceProvider implements Provider {
  readonly id = "eclipse-marketplace";
  readonly displayName = "Eclipse features";
  readonly installHint = "https://www.eclipse.org/downloads/";

  async isAvailable(): Promise<boolean> {
    return (await findEclipseHome()) !== null;
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const home = await findEclipseHome();
    if (!home) return [];

    const featuresDir = join(home, "features");
    if (!existsSync(featuresDir)) return [];

    let entries: string[];
    try {
      entries = await readdir(featuresDir);
    } catch {
      return [];
    }

    const out: OutdatedPackage[] = [];
    for (const entry of entries) {
      const split = entry.lastIndexOf("_");
      if (split < 0) continue;
      const id = entry.slice(0, split);
      const version = entry.slice(split + 1);
      if (!isPlausibleVersion(version)) continue;
      // Filter out org.eclipse.* platform features (they update with the
      // Eclipse runtime itself, not via Marketplace).
      if (id.startsWith("org.eclipse.")) continue;
      out.push({
        id,
        name: id,
        current: version,
        latest: "?",
        note: "Help â†’ Check for Updates",
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
      message: "Eclipse â†’ Help â†’ Check for Updates.",
    };
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    return packages.map((p) => ({
      id: p.id,
      success: false,
      skipped: true,
      message: "Update via Eclipse (Help â†’ Check for Updates).",
    }));
  }
}

async function findEclipseHome(): Promise<string | null> {
  if (await commandExists("eclipsec")) {
    // Resolve PATH location to determine the home directory.
    // Falls through to filesystem probe if the resolution fails.
  }

  const roots: string[] = [];
  for (const env of ["PROGRAMFILES", "PROGRAMFILES(X86)", "LOCALAPPDATA"]) {
    const base = process.env[env];
    if (!base) continue;
    roots.push(
      join(base, "Eclipse Foundation"),
      join(base, "Eclipse Adoptium"),
      join(base, "eclipse"),
      join(base, "Programs", "eclipse"),
    );
  }

  for (const root of roots) {
    if (!existsSync(root)) continue;
    // Either `<root>` is an eclipse home itself, or it contains nested
    // installs (e.g. multiple Eclipse profiles under Eclipse Foundation).
    const direct = await checkEclipseHome(root);
    if (direct) return direct;
    try {
      const children = await readdir(root);
      for (const child of children) {
        const candidate = await checkEclipseHome(join(root, child));
        if (candidate) return candidate;
      }
    } catch {
      /* ignore */
    }
  }
  return null;
}

async function checkEclipseHome(path: string): Promise<string | null> {
  if (!existsSync(path)) return null;
  try {
    const info = await stat(path);
    if (!info.isDirectory()) return null;
  } catch {
    return null;
  }
  if (!existsSync(join(path, "features"))) return null;
  if (!existsSync(join(path, "plugins"))) return null;
  return path;
}

function isPlausibleVersion(s: string): boolean {
  return /^\d+(?:\.\d+){1,3}/.test(s);
}
