import { existsSync } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { posix as posixPath, win32 as winPath } from "node:path";
import { pickInstallHint } from "../../core/install-hint.js";
import { commandExists } from "../../core/runner.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

/**
 * Eclipse Marketplace / p2 features.
 *
 * The p2 director (`eclipsec.exe -application org.eclipse.equinox.p2.director`)
 * can install/uninstall IUs but exposes no clean "update all" verb usable
 * without per-IU bookkeeping (profile id, update-site URL, tag). In
 * practice Eclipse users update through Help → Check for Updates, so this
 * provider is detect-only: it inventories installed top-level features so
 * the user can see them surfaced in `gup`, then defers the actual upgrade.
 *
 * Detection probes the well-known Windows and macOS install roots and PATH;
 * once an eclipse home is found we walk `<eclipse>/features` to enumerate
 * `<id>_<version>` directory names.
 */
export class EclipseMarketplaceProvider implements Provider {
  readonly id = "eclipse-marketplace";
  readonly displayName = "Eclipse features";
  readonly installHint = pickInstallHint({
    darwin: "brew install --cask eclipse-ide",
    fallback: "https://www.eclipse.org/downloads/",
  });

  async isAvailable(): Promise<boolean> {
    return (await findEclipseHome()) !== null;
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const home = await findEclipseHome();
    if (!home) return [];

    const featuresDir = joinPath(home, "features");
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
        note: "Help → Check for Updates",
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
      message: "Eclipse → Help → Check for Updates.",
    };
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    return packages.map((p) => ({
      id: p.id,
      success: false,
      skipped: true,
      message: "Update via Eclipse (Help → Check for Updates).",
    }));
  }
}

/**
 * Join with the separator of the running OS rather than the host's — the two
 * differ under test, where `process.platform` is forced to "win32" on a POSIX
 * box and a bare `join()` would emit "/" where the asserted `C:\…` roots need
 * "\".
 *
 * Keyed on win32 specifically, not on "not darwin": under WSL this is a Linux
 * process that may still see translated `PROGRAMFILES`/`LOCALAPPDATA` values
 * (`/mnt/c/…`), and joining those with backslashes would produce a path that
 * resolves nowhere.
 */
function joinPath(...parts: string[]): string {
  return process.platform === "win32"
    ? winPath.join(...parts)
    : posixPath.join(...parts);
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
      joinPath(base, "Eclipse Foundation"),
      joinPath(base, "Eclipse Adoptium"),
      joinPath(base, "eclipse"),
      joinPath(base, "Programs", "eclipse"),
    );
  }
  roots.push(...darwinRoots());

  for (const root of roots) {
    if (!existsSync(root)) continue;
    // Either `<root>` is an eclipse home itself, or it contains nested
    // installs (e.g. multiple Eclipse profiles under Eclipse Foundation).
    const direct = await checkEclipseHome(root);
    if (direct) return direct;
    try {
      const children = await readdir(root);
      for (const child of children) {
        const candidate = await checkEclipseHome(joinPath(root, child));
        if (candidate) return candidate;
      }
    } catch {
      /* ignore */
    }
  }
  return null;
}

/**
 * macOS install locations, appended after the Windows probes (which yield
 * nothing there, since none of PROGRAMFILES/LOCALAPPDATA is set): the app
 * bundle dropped in `/Applications` — by hand or by `brew install --cask
 * eclipse-ide` — and `~/eclipse`, where the Eclipse Installer puts per-flavour
 * installs. `/Applications` and `~/Applications` are also swept as roots so a
 * differently-named bundle (Eclipse JEE, Spring Tools…) is still found through
 * the nested-children pass.
 */
function darwinRoots(): string[] {
  if (process.platform !== "darwin") return [];
  const home = process.env["HOME"] ?? "";
  return [
    "/Applications/Eclipse.app",
    home && posixPath.join(home, "eclipse"),
    "/Applications",
    home && posixPath.join(home, "Applications"),
  ].filter(Boolean);
}

async function checkEclipseHome(path: string): Promise<string | null> {
  const direct = await checkEquinoxRoot(path);
  if (direct) return direct;
  // macOS ships Eclipse as an `.app` bundle: the equinox install (features/,
  // plugins/) sits at `<X>.app/Contents/Eclipse`, not at the bundle root. No
  // Windows path ever ends in `.app`, so this is a no-op on win32 — same
  // probes, same order.
  if (process.platform !== "darwin" || !path.endsWith(".app")) return null;
  return checkEquinoxRoot(posixPath.join(path, "Contents", "Eclipse"));
}

async function checkEquinoxRoot(path: string): Promise<string | null> {
  if (!existsSync(path)) return null;
  try {
    const info = await stat(path);
    if (!info.isDirectory()) return null;
  } catch {
    return null;
  }
  if (!existsSync(joinPath(path, "features"))) return null;
  if (!existsSync(joinPath(path, "plugins"))) return null;
  return path;
}

function isPlausibleVersion(s: string): boolean {
  return /^\d+(?:\.\d+){1,3}/.test(s);
}
