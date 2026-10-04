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
import { installConsole } from "../../core/process/output-router.js";
import { runInherit } from "../../core/runner.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";
import { PLATFORMS } from "../../core/platform/platforms.js";

/**
 * Nerd Fonts (https://github.com/ryanoasis/nerd-fonts).
 *
 * A 100 % user-scope strategy:
 *  - Detection: scan `%LOCALAPPDATA%\Microsoft\Windows\Fonts` for the TTF/OTF
 *    files containing "NerdFont" → grouped by family (the original zip).
 *  - Version source of truth: the lockfile `%LOCALAPPDATA%\gup\nerd-fonts.json`
 *    (`{ "<zipName>": "<tag>" }`). Without an entry, "?" is shown and the
 *    family counts as outdated (re-pinned on the current release).
 *  - Latest: the tag of the newest `ryanoasis/nerd-fonts` release.
 *  - Update: downloads the release's `<zipName>.zip`, extracts it, copies
 *    `*NerdFont*.ttf/.otf` into the user fonts folder, registers each font
 *    in HKCU, and updates the lockfile.
 *
 * Bootstrap: `gup update nerd-fonts:<zipName>` works even when no font is
 * installed, so the user can install, say, FiraCode with no prior step.
 */
export class NerdFontsProvider implements Provider {
  readonly id = "nerd-fonts";
  readonly displayName = "Nerd Fonts";
  readonly installHint = "gup update nerd-fonts:<Famille>  (FiraCode, JetBrainsMono, Meslo, …)";
  /** gup installs the fonts per user under %LOCALAPPDATA% and registers them in HKCU. */
  readonly platforms = PLATFORMS.windows;
  readonly slow = true;

  async isAvailable(): Promise<boolean> {
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
    const userDir = resolveUserFontsDir();
    if (!userDir) return failed(packageId, "Provider Windows-only (per-user fonts).");
    if (!isSafeFamilyName(packageId)) {
      return failed(packageId, `Nom de famille invalide: "${packageId}"`);
    }

    const latest = await fetchGitHubReleaseLatest("ryanoasis/nerd-fonts", {
      stripVPrefix: false,
    });
    if (!latest) {
      return failed(packageId, "Impossible de récupérer la dernière release Nerd Fonts.");
    }

    const download = await downloadFamilyZip(packageId, latest);
    if ("message" in download) return failed(packageId, download.message);

    return installFamily({ packageId, latest, zip: download.zip, userDir });
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    const outcomes: UpdateOutcome[] = [];
    for (const pkg of packages) outcomes.push(await this.update(pkg.id));
    return outcomes;
  }
}

// ---------------------------------------------------------------------------
// update — steps

function failed(id: string, message: string): UpdateOutcome {
  return { id, success: false, message };
}

/**
 * User fonts directory, or `null` when this provider can drive nothing here.
 * The lockfile lives under `%LOCALAPPDATA%` too, so a missing `gupDataDir()`
 * disqualifies the update just as much as a missing fonts directory.
 */
function resolveUserFontsDir(): string | null {
  if (process.platform !== "win32") return null;
  const userDir = userFontsDir();
  return userDir && gupDataDir() ? userDir : null;
}

interface DownloadedZip {
  zip: ArrayBuffer;
}

interface DownloadError {
  message: string;
}

async function downloadFamilyZip(
  packageId: string,
  latest: string,
): Promise<DownloadedZip | DownloadError> {
  const releases = "https://github.com/ryanoasis/nerd-fonts/releases";
  const url = `${releases}/download/${latest}/${packageId}.zip`;
  installConsole.log(`  ↓ ${url}`);
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
    if (!res.ok) {
      return {
        message:
          `Asset introuvable (HTTP ${res.status}). ` +
          `Vérifie le nom : ${releases}/tag/${latest}`,
      };
    }
    return { zip: await res.arrayBuffer() };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return { message: `Échec téléchargement : ${reason}` };
  }
}

interface InstallRequest {
  packageId: string;
  latest: string;
  zip: ArrayBuffer;
  userDir: string;
}

const NO_FONT_IN_ZIP = "Aucun fichier *NerdFont*.(ttf|otf) trouvé dans";
const HKCU_REGISTRATION_FAILED =
  "Copie OK mais enregistrement HKCU échoué — relancer un shell, ou re-exécuter.";

async function installFamily(req: InstallRequest): Promise<UpdateOutcome> {
  const { packageId, latest, zip, userDir } = req;
  const tmpRoot = await mkdtemp(join(tmpdir(), "gup-nerd-"));
  try {
    const entries = fontEntriesOf(zip);
    if (entries.length === 0) {
      return failed(packageId, `${NO_FONT_IN_ZIP} ${packageId}.zip`);
    }
    const installed = await copyFontsToUserDir(entries, tmpRoot, userDir);
    if (!(await registerFontsInHKCU(installed))) {
      return failed(packageId, HKCU_REGISTRATION_FAILED);
    }
    await pinFamilyVersion(packageId, latest);
    const count = installed.length;
    installConsole.log(`  ✓ ${count} fichier(s) installé(s) dans ${userDir}`);
    return { id: packageId, success: true };
  } catch (err) {
    return failed(packageId, err instanceof Error ? err.message : String(err));
  } finally {
    await rm(tmpRoot, { recursive: true, force: true }).catch(() => {});
  }
}

function fontEntriesOf(zip: ArrayBuffer): AdmZip.IZipEntry[] {
  return new AdmZip(Buffer.from(zip))
    .getEntries()
    .filter((e) => !e.isDirectory && /NerdFont.*\.(ttf|otf)$/i.test(e.entryName));
}

async function copyFontsToUserDir(
  entries: AdmZip.IZipEntry[],
  tmpRoot: string,
  userDir: string,
): Promise<string[]> {
  await mkdir(userDir, { recursive: true });
  const installed: string[] = [];
  for (const entry of entries) {
    const fileName = entry.entryName.split(/[\\/]/).pop()!;
    const tmpFile = join(tmpRoot, fileName);
    await writeFile(tmpFile, entry.getData());
    // Destination under `%LOCALAPPDATA%`: a Windows path, see below.
    const dest = winPath.join(userDir, fileName);
    await copyFile(tmpFile, dest);
    installed.push(dest);
  }
  return installed;
}

async function pinFamilyVersion(packageId: string, latest: string): Promise<void> {
  const lock = await readLockfile();
  lock[packageId] = latest;
  await writeLockfile(lock);
}

// ---------------------------------------------------------------------------
// helpers

// These three paths are anchored on `%LOCALAPPDATA%`: they are Windows paths
// whatever host runs the code (the tests mock `process.platform`). Hence
// `winPath.join` and not `join`, whose separator follows the host.
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
 * File prefix → original zip name, for the families whose font name does
 * not match the archive name. Extend as needed.
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
    const data: unknown = JSON.parse(await readFile(path, "utf8"));
    if (!data || typeof data !== "object" || Array.isArray(data)) return {};
    return onlyStringValues(data as Record<string, unknown>);
  } catch {
    return {};
  }
}

/** Keep entries whose value is a string, drop the rest. */
function onlyStringValues(data: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(data)) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

async function writeLockfile(data: Record<string, string>): Promise<void> {
  const dir = gupDataDir();
  if (!dir) return;
  await mkdir(dir, { recursive: true });
  await writeFile(lockfilePath(), JSON.stringify(data, null, 2) + "\n", "utf8");
}

/**
 * Restricted to the characters a Nerd Fonts asset name is expected to hold
 * (`FiraCode`, `0xProto`, `Go-Mono`, `iA-Writer`…). Prevents any injection
 * into the URL or the path of the downloaded zip file.
 */
function isSafeFamilyName(name: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9_.+-]{0,63}$/.test(name);
}

/**
 * Registers each font under `HKCU:\Software\Microsoft\Windows NT\CurrentVersion\Fonts`.
 * Windows 10/11 recognise these entries as per-user fonts on their own — no
 * UAC needed, nor any write to `HKLM`.
 */
const FONTS_KEY_PARENT = String.raw`HKCU:\Software\Microsoft\Windows NT\CurrentVersion`;
const FONTS_KEY = `${FONTS_KEY_PARENT}\\Fonts`;

/** One `New-ItemProperty` per font, values escaped for PowerShell. */
function registryCommandFor(fontPath: string): string {
  const baseName = fontPath.split(/[\\/]/).pop()!;
  const suffix = /\.otf$/i.test(baseName) ? " (OpenType)" : " (TrueType)";
  const valueName = baseName.replace(/\.(ttf|otf)$/i, "") + suffix;
  // PowerShell single-quoted string: ' → ''
  const psPath = fontPath.replace(/'/g, "''");
  const psName = valueName.replace(/'/g, "''");
  return (
    `New-ItemProperty -Path '${FONTS_KEY}' -Name '${psName}' ` +
    `-PropertyType String -Value '${psPath}' -Force | Out-Null`
  );
}

async function registerFontsInHKCU(filePaths: string[]): Promise<boolean> {
  if (filePaths.length === 0) return true;
  const entries = filePaths.map(registryCommandFor).join("; ");

  const script =
    `$ErrorActionPreference = 'Stop'; ` +
    `if (-not (Test-Path '${FONTS_KEY}')) { ` +
    `New-Item -Path '${FONTS_KEY_PARENT}' -Name 'Fonts' -Force | Out-Null }; ` +
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
