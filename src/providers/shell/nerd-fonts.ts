import { existsSync } from "node:fs";
import {
  mkdir,
  readdir,
  readFile,
  rm,
  writeFile,
  copyFile,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import AdmZip from "adm-zip";
import { fetchGitHubReleaseLatest } from "../../core/gh-releases.js";
import { runInherit } from "../../core/runner.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

/**
 * Nerd Fonts (https://github.com/ryanoasis/nerd-fonts).
 *
 * StratÃ©gie 100 % user-scope :
 *  - DÃ©tection : scan `%LOCALAPPDATA%\Microsoft\Windows\Fonts` pour les TTF/OTF
 *    contenant "NerdFont" â†’ groupage par famille (zip d'origine).
 *  - Source de vÃ©ritÃ© version : lockfile `%LOCALAPPDATA%\gup\nerd-fonts.json`
 *    (`{ "<zipName>": "<tag>" }`). Sans entrÃ©e, on affiche "?" et la famille
 *    est considÃ©rÃ©e comme Ã  mettre Ã  jour (re-pin sur la release courante).
 *  - Latest : tag de la release la plus rÃ©cente de `ryanoasis/nerd-fonts`.
 *  - Update : tÃ©lÃ©charge `<zipName>.zip` de la release, extrait, copie
 *    `*NerdFont*.ttf/.otf` dans le dossier fonts utilisateur, enregistre
 *    chaque police dans HKCU. Met Ã  jour le lockfile.
 *
 * Bootstrap : `gup update nerd-fonts:<zipName>` fonctionne mÃªme si aucune
 * police n'est installÃ©e, donc l'utilisateur peut installer p.ex. FiraCode
 * sans Ã©tape prÃ©alable.
 */
export class NerdFontsProvider implements Provider {
  readonly id = "nerd-fonts";
  readonly displayName = "Nerd Fonts";
  readonly installHint = "gup update nerd-fonts:<Famille>  (FiraCode, JetBrainsMono, Meslo, â€¦)";
  readonly slow = true;

  async isAvailable(): Promise<boolean> {
    if (process.platform !== "win32") return false;
    if (!userFontsDir() || !gupDataDir()) return false;
    if (existsSync(lockfilePath())) return true;
    return (await detectInstalledFamilies()).length > 0;
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const detected = await detectInstalledFamilies();
    const lock = await readLockfile();
    const tracked = Object.keys(lock);

    // Union of detected (filesystem) + tracked (lockfile) â€” lockfile alone
    // keeps the entry surfaced even if the user deletes all glyphs by mistake.
    const families = new Set<string>([...detected, ...tracked]);
    if (families.size === 0) return [];

    const latest = await fetchGitHubReleaseLatest("ryanoasis/nerd-fonts", {
      stripVPrefix: false,
    });
    if (!latest) return [];

    const out: OutdatedPackage[] = [];
    for (const family of families) {
      const current = lock[family];
      if (current === latest) continue;
      out.push({
        id: family,
        name: `Nerd Font â€” ${family}`,
        current: current ?? "?",
        latest,
        ...(current ? {} : { note: "non suivi par gup â€” rÃ©installer pour pinner" }),
      });
    }
    return out;
  }

  async update(packageId: string): Promise<UpdateOutcome> {
    const userDir = userFontsDir();
    const dataDir = gupDataDir();
    if (process.platform !== "win32" || !userDir || !dataDir) {
      return {
        id: packageId,
        success: false,
        message: "Provider Windows-only (per-user fonts).",
      };
    }
    if (!isSafeFamilyName(packageId)) {
      return {
        id: packageId,
        success: false,
        message: `Nom de famille invalide: "${packageId}"`,
      };
    }

    const latest = await fetchGitHubReleaseLatest("ryanoasis/nerd-fonts", {
      stripVPrefix: false,
    });
    if (!latest) {
      return {
        id: packageId,
        success: false,
        message: "Impossible de rÃ©cupÃ©rer la derniÃ¨re release Nerd Fonts.",
      };
    }

    const url = `https://github.com/ryanoasis/nerd-fonts/releases/download/${latest}/${packageId}.zip`;
    process.stdout.write(`  â†“ ${url}\n`);

    let buf: ArrayBuffer;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
      if (!res.ok) {
        return {
          id: packageId,
          success: false,
          message: `Asset introuvable (HTTP ${res.status}). VÃ©rifie le nom : https://github.com/ryanoasis/nerd-fonts/releases/tag/${latest}`,
        };
      }
      buf = await res.arrayBuffer();
    } catch (err) {
      return {
        id: packageId,
        success: false,
        message: `Ã‰chec tÃ©lÃ©chargement : ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    const tmpRoot = join(tmpdir(), `gup-nerd-${packageId}-${Date.now()}`);
    try {
      await mkdir(tmpRoot, { recursive: true });
      const zip = new AdmZip(Buffer.from(buf));
      const fontEntries = zip
        .getEntries()
        .filter(
          (e) => !e.isDirectory && /NerdFont.*\.(ttf|otf)$/i.test(e.entryName),
        );
      if (fontEntries.length === 0) {
        return {
          id: packageId,
          success: false,
          message: `Aucun fichier *NerdFont*.(ttf|otf) trouvÃ© dans ${packageId}.zip`,
        };
      }

      await mkdir(userDir, { recursive: true });
      const installed: string[] = [];
      for (const entry of fontEntries) {
        const fileName = entry.entryName.split(/[\\/]/).pop()!;
        const tmpFile = join(tmpRoot, fileName);
        await writeFile(tmpFile, entry.getData());
        const dest = join(userDir, fileName);
        await copyFile(tmpFile, dest);
        installed.push(dest);
      }

      const regOk = await registerFontsInHKCU(installed);
      if (!regOk) {
        return {
          id: packageId,
          success: false,
          message:
            "Copie OK mais enregistrement HKCU Ã©chouÃ© â€” relancer un shell, ou re-exÃ©cuter.",
        };
      }

      const lock = await readLockfile();
      lock[packageId] = latest;
      await writeLockfile(lock);

      process.stdout.write(
        `  âœ“ ${installed.length} fichier(s) installÃ©(s) dans ${userDir}\n`,
      );
      return { id: packageId, success: true };
    } catch (err) {
      return {
        id: packageId,
        success: false,
        message: err instanceof Error ? err.message : String(err),
      };
    } finally {
      await rm(tmpRoot, { recursive: true, force: true }).catch(() => {});
    }
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    const outcomes: UpdateOutcome[] = [];
    for (const pkg of packages) outcomes.push(await this.update(pkg.id));
    return outcomes;
  }
}

// ---------------------------------------------------------------------------
// helpers

function userFontsDir(): string {
  const local = process.env["LOCALAPPDATA"] ?? "";
  return local ? join(local, "Microsoft", "Windows", "Fonts") : "";
}

function gupDataDir(): string {
  const local = process.env["LOCALAPPDATA"] ?? "";
  return local ? join(local, "gup") : "";
}

function lockfilePath(): string {
  return join(gupDataDir(), "nerd-fonts.json");
}

/**
 * Mapping prefix-fichier â†’ nom de zip d'origine pour les familles dont le
 * nom de police ne matche pas le nom d'archive. Ã‰tendre au besoin.
 */
const FAMILY_ALIASES: Record<string, string> = {
  CaskaydiaCove: "CascadiaCode",
  CaskaydiaMono: "CascadiaMono",
  MesloLGL: "Meslo",
  MesloLGM: "Meslo",
  MesloLGS: "Meslo",
  DaddyTimeMono: "DaddyTimeMono",
  GoMono: "Go-Mono",
};

function familyFromFileName(fileName: string): string | null {
  // Strip extension and trailing "-Regular"/"-Bold"/... + variant suffix.
  const base = fileName.replace(/\.(ttf|otf)$/i, "");
  // Match "<Family>NerdFont(Mono|Propo)?(-Weight)?"
  const m = base.match(/^(.+?)NerdFont(Mono|Propo)?/i);
  if (!m) return null;
  const prefix = m[1]!.trim();
  if (!prefix) return null;
  return FAMILY_ALIASES[prefix] ?? prefix;
}

async function detectInstalledFamilies(): Promise<string[]> {
  const dir = userFontsDir();
  if (!dir || !existsSync(dir)) return [];
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }
  const families = new Set<string>();
  for (const name of entries) {
    if (!/NerdFont/i.test(name)) continue;
    if (!/\.(ttf|otf)$/i.test(name)) continue;
    const family = familyFromFileName(name);
    if (family) families.add(family);
  }
  return [...families].sort((a, b) => a.localeCompare(b));
}

async function readLockfile(): Promise<Record<string, string>> {
  const path = lockfilePath();
  if (!existsSync(path)) return {};
  try {
    const raw = await readFile(path, "utf8");
    const data = JSON.parse(raw);
    if (data && typeof data === "object" && !Array.isArray(data)) {
      // Filter to string values only â€” drop garbage gracefully.
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(data)) {
        if (typeof v === "string") out[k] = v;
      }
      return out;
    }
    return {};
  } catch {
    return {};
  }
}

async function writeLockfile(data: Record<string, string>): Promise<void> {
  const dir = gupDataDir();
  if (!dir) return;
  await mkdir(dir, { recursive: true });
  await writeFile(lockfilePath(), JSON.stringify(data, null, 2) + "\n", "utf8");
}

/**
 * Restreint au sous-ensemble de caractÃ¨res qu'on s'attend Ã  voir dans un nom
 * d'asset Nerd Fonts (`FiraCode`, `0xProto`, `Go-Mono`, `iA-Writer`â€¦). EmpÃªche
 * toute injection dans l'URL ou le chemin du fichier zip tÃ©lÃ©chargÃ©.
 */
function isSafeFamilyName(name: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9_.+-]{0,63}$/.test(name);
}

/**
 * Enregistre chaque police dans `HKCU:\Software\Microsoft\Windows NT\CurrentVersion\Fonts`.
 * Win11/10 reconnaÃ®t automatiquement ces entrÃ©es comme polices per-user â€” pas
 * besoin de UAC ni d'Ã©crire dans `HKLM`.
 */
async function registerFontsInHKCU(filePaths: string[]): Promise<boolean> {
  if (filePaths.length === 0) return true;
  const entries = filePaths
    .map((p) => {
      const baseName = p.split(/[\\/]/).pop()!;
      const suffix = /\.otf$/i.test(baseName) ? " (OpenType)" : " (TrueType)";
      const valueName = baseName.replace(/\.(ttf|otf)$/i, "") + suffix;
      // PowerShell single-quoted string: ' â†’ ''
      const psPath = p.replace(/'/g, "''");
      const psName = valueName.replace(/'/g, "''");
      return `New-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Fonts' -Name '${psName}' -PropertyType String -Value '${psPath}' -Force | Out-Null`;
    })
    .join("; ");

  const script =
    `$ErrorActionPreference = 'Stop'; ` +
    `if (-not (Test-Path 'HKCU:\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Fonts')) { ` +
    `New-Item -Path 'HKCU:\\Software\\Microsoft\\Windows NT\\CurrentVersion' -Name 'Fonts' -Force | Out-Null }; ` +
    entries;

  const res = await runInherit("powershell.exe", [
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    script,
  ]);
  return !res.failed;
}
