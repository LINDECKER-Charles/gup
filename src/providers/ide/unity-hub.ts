import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { win32 as winPath } from "node:path";
import { pickInstallHint } from "../../core/install-hint.js";
import { run } from "../../core/runner.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

interface InstalledEditor {
  version: string;
  path?: string;
}

/**
 * Unity Hub — manages installed Unity Editor versions.
 *
 * Detection is filesystem-only (the Hub binary lives in a fixed install
 * path on Windows). The Hub CLI (`Unity Hub.exe -- --headless editors
 * --installed`) lists installed editors but it's a GUI process invoked
 * non-interactively, with quirky output — we fall back to parsing
 * `%APPDATA%\UnityHub\editors-v2.json` when present.
 *
 * Latest version lookup goes to Unity's public release feed. Items are
 * `manual: true`: the Hub itself is the only safe path to install/upgrade
 * an editor (it manages modules, license activation, etc.).
 */
export class UnityHubProvider implements Provider {
  readonly id = "unity-hub";
  readonly displayName = "Unity Editor (via Hub)";
  // Le Hub existe sur macOS/Linux, mais la détection ci-dessous est encore
  // limitée aux chemins Windows : le dire plutôt que promettre une détection.
  readonly installHint = pickInstallHint({
    win32: "https://unity.com/unity-hub",
    fallback:
      "Détection Windows uniquement pour l'instant : https://unity.com/unity-hub",
  });
  readonly slow = true;

  async isAvailable(): Promise<boolean> {
    return unityHubExe() !== null;
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const installed = await listInstalledEditors();
    if (installed.length === 0) return [];

    const latestLts = await fetchLatestLts();
    return installed.map((ed) => ({
      id: ed.version,
      name: `Unity ${ed.version}`,
      current: ed.version,
      latest: latestLts ?? "?",
      note: ed.path ?? "Hub-managed",
      manual: true,
    }));
  }

  async update(packageId: string): Promise<UpdateOutcome> {
    return {
      id: packageId,
      success: false,
      skipped: true,
      message: "Mettre à jour depuis Unity Hub (Installs → ⋮ → Install Editor).",
    };
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    return packages.map((p) => ({
      id: p.id,
      success: false,
      skipped: true,
      message: "Update via Unity Hub.",
    }));
  }
}

function unityHubExe(): string | null {
  if (process.platform !== "win32") return null;
  const candidates = [
    process.env["PROGRAMFILES"] && winPath.join(process.env["PROGRAMFILES"], "Unity Hub", "Unity Hub.exe"),
    process.env["PROGRAMFILES(X86)"] && winPath.join(process.env["PROGRAMFILES(X86)"], "Unity Hub", "Unity Hub.exe"),
  ].filter((p): p is string => typeof p === "string");
  return candidates.find((p) => existsSync(p)) ?? null;
}

function editorsConfigFile(): string {
  const appdata = process.env["APPDATA"];
  return appdata ? winPath.join(appdata, "UnityHub", "editors-v2.json") : "";
}

async function listInstalledEditors(): Promise<InstalledEditor[]> {
  // Prefer the JSON the Hub maintains — no process spawn, no GUI dance.
  const fromConfig = await editorsFromConfig();
  if (fromConfig.length > 0) return fromConfig;

  const exe = unityHubExe();
  if (!exe) return [];
  const { stdout, failed } = await run(
    exe,
    ["--", "--headless", "editors", "--installed"],
    { timeout: 15_000 },
  );
  if (failed) return [];
  return parseHubEditorList(stdout);
}

/**
 * Éditeurs listés dans le JSON maintenu par le Hub. Renvoie un tableau vide
 * — et non une erreur — dès que le fichier manque ou n'est pas lisible :
 * l'appelant retombe alors sur le CLI du Hub.
 */
async function editorsFromConfig(): Promise<InstalledEditor[]> {
  const cfg = editorsConfigFile();
  if (!existsSync(cfg)) return [];
  try {
    const raw = await readFile(cfg, "utf8");
    const data = JSON.parse(raw) as Record<
      string,
      { version?: string; location?: string[] }
    >;
    return Object.entries(data)
      .filter(([version]) => Boolean(version))
      .map(([version, info]) => {
        const loc = info?.location?.[0];
        return loc ? { version, path: loc } : { version };
      });
  } catch {
    return []; /* fall through to CLI */
  }
}

function parseHubEditorList(stdout: string): InstalledEditor[] {
  // Hub prints lines like "2022.3.42f1 , installed at C:\\Program Files\\Unity\\Hub\\Editor\\2022.3.42f1\\Editor\\Unity.exe"
  const out: InstalledEditor[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    const m = line.match(/^(\S+)\s*(?:,\s*installed at\s*(.+))?/);
    if (!m) continue;
    const version = m[1]?.trim();
    if (!version || !/^\d+\.\d+/.test(version)) continue;
    const path = m[2]?.trim();
    out.push(path ? { version, path } : { version });
  }
  return out;
}

async function fetchLatestLts(): Promise<string | null> {
  try {
    const res = await fetch(
      "https://public-cdn.cloud.unity3d.com/hub/prod/releases-win32.json",
      { signal: AbortSignal.timeout(6_000) },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { lts?: Array<{ version?: string }> };
    return data.lts?.[0]?.version ?? null;
  } catch {
    return null;
  }
}
