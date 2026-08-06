import { existsSync } from "node:fs";
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
  copyFile,
} from "node:fs/promises";
import { join, win32 as winPath } from "node:path";
import { tmpdir } from "node:os";
import AdmZip from "adm-zip";
import { fetchGitHubReleaseLatest } from "../../core/gh-releases.js";
import { pickInstallHint } from "../../core/install-hint.js";
import { runInherit } from "../../core/runner.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

/**
 * Nerd Fonts (https://github.com/ryanoasis/nerd-fonts).
 *
 * Stratégie 100 % user-scope :
 *  - Détection : scan `%LOCALAPPDATA%\Microsoft\Windows\Fonts` pour les TTF/OTF
 *    contenant "NerdFont" → groupage par famille (zip d'origine).
 *  - Source de vérité version : lockfile `%LOCALAPPDATA%\gup\nerd-fonts.json`
 *    (`{ "<zipName>": "<tag>" }`). Sans entrée, on affiche "?" et la famille
 *    est considérée comme à mettre à jour (re-pin sur la release courante).
 *  - Latest : tag de la release la plus récente de `ryanoasis/nerd-fonts`.
 *  - Update : télécharge `<zipName>.zip` de la release, extrait, copie
 *    `*NerdFont*.ttf/.otf` dans le dossier fonts utilisateur, enregistre
 *    chaque police dans HKCU. Met à jour le lockfile.
 *
 * Bootstrap : `gup update nerd-fonts:<zipName>` fonctionne même si aucune
 * police n'est installée, donc l'utilisateur peut installer p.ex. FiraCode
 * sans étape préalable.
 */
export class NerdFontsProvider implements Provider {
  readonly id = "nerd-fonts";
  readonly displayName = "Nerd Fonts";
  // Le pilotage par gup reste Windows-only (fonts per-user + enregistrement
  // HKCU). Ailleurs, Homebrew publie chaque famille en cask, donc on renvoie
  // vers `brew` plutôt que de laisser l'utilisateur sur une piste morte.
  readonly installHint = pickInstallHint({
    win32: "gup update nerd-fonts:<Famille>  (FiraCode, JetBrainsMono, Meslo, …)",
    darwin:
      "Windows uniquement — sur macOS : brew install --cask font-<nom>-nerd-font (ex. font-fira-code-nerd-font)",
    fallback:
      "Windows uniquement — ailleurs : https://github.com/ryanoasis/nerd-fonts/releases",
  });
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

    // Union of detected (filesystem) + tracked (lockfile) — lockfile alone
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
        name: `Nerd Font — ${family}`,
        current: current ?? "?",
        latest,
        ...(current ? {} : { note: "non suivi par gup — réinstaller pour pinner" }),
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
        message: "Impossible de récupérer la dernière release Nerd Fonts.",
      };
    }

    const url = `https://github.com/ryanoasis/nerd-fonts/releases/download/${latest}/${packageId}.zip`;
    process.stdout.write(`  ↓ ${url}\n`);

    let buf: ArrayBuffer;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
      if (!res.ok) {
        return {
          id: packageId,
          success: false,
          message: `Asset introuvable (HTTP ${res.status}). Vérifie le nom : https://github.com/ryanoasis/nerd-fonts/releases/tag/${latest}`,
        };
      }
      buf = await res.arrayBuffer();
    } catch (err) {
      return {
        id: packageId,
        success: false,
        message: `Échec téléchargement : ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    const tmpRoot = await mkdtemp(join(tmpdir(), "gup-nerd-"));
    try {
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
          message: `Aucun fichier *NerdFont*.(ttf|otf) trouvé dans ${packageId}.zip`,
        };
      }

      await mkdir(userDir, { recursive: true });
      const installed: string[] = [];
      for (const entry of fontEntries) {
        const fileName = entry.entryName.split(/[\\/]/).pop()!;
        const tmpFile = join(tmpRoot, fileName);
        await writeFile(tmpFile, entry.getData());
        // Destination sous `%LOCALAPPDATA%` : chemin Windows, cf. plus bas.
        const dest = winPath.join(userDir, fileName);
        await copyFile(tmpFile, dest);
        installed.push(dest);
      }

      const regOk = await registerFontsInHKCU(installed);
      if (!regOk) {
        return {
          id: packageId,
          success: false,
          message:
            "Copie OK mais enregistrement HKCU échoué — relancer un shell, ou re-exécuter.",
        };
      }

      const lock = await readLockfile();
      lock[packageId] = latest;
      await writeLockfile(lock);

      process.stdout.write(
        `  ✓ ${installed.length} fichier(s) installé(s) dans ${userDir}\n`,
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

// Ces trois chemins sont ancrés sur `%LOCALAPPDATA%` : ce sont des chemins
// Windows, quel que soit l'hôte qui exécute le code (les tests mockent
// `process.platform`). D'où `winPath.join` et non `join`, dont le séparateur
// suit l'hôte.
function userFontsDir(): string {
  const local = process.env["LOCALAPPDATA"] ?? "";
  return local ? winPath.join(local, "Microsoft", "Windows", "Fonts") : "";
}

function gupDataDir(): string {
  const local = process.env["LOCALAPPDATA"] ?? "";
  return local ? winPath.join(local, "gup") : "";
}

function lockfilePath(): string {
  return winPath.join(gupDataDir(), "nerd-fonts.json");
}

/**
 * Mapping prefix-fichier → nom de zip d'origine pour les familles dont le
 * nom de police ne matche pas le nom d'archive. Étendre au besoin.
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
      // Filter to string values only — drop garbage gracefully.
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
 * Restreint au sous-ensemble de caractères qu'on s'attend à voir dans un nom
 * d'asset Nerd Fonts (`FiraCode`, `0xProto`, `Go-Mono`, `iA-Writer`…). Empêche
 * toute injection dans l'URL ou le chemin du fichier zip téléchargé.
 */
function isSafeFamilyName(name: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9_.+-]{0,63}$/.test(name);
}

/**
 * Enregistre chaque police dans `HKCU:\Software\Microsoft\Windows NT\CurrentVersion\Fonts`.
 * Win11/10 reconnaît automatiquement ces entrées comme polices per-user — pas
 * besoin de UAC ni d'écrire dans `HKLM`.
 */
async function registerFontsInHKCU(filePaths: string[]): Promise<boolean> {
  if (filePaths.length === 0) return true;
  const entries = filePaths
    .map((p) => {
      const baseName = p.split(/[\\/]/).pop()!;
      const suffix = /\.otf$/i.test(baseName) ? " (OpenType)" : " (TrueType)";
      const valueName = baseName.replace(/\.(ttf|otf)$/i, "") + suffix;
      // PowerShell single-quoted string: ' → ''
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
