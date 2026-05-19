import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { run } from "../../core/runner.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

interface InstalledEditor {
  version: string;
  path?: string;
}

/**
 * Unity Hub â€” manages installed Unity Editor versions.
 *
 * Detection is filesystem-only (the Hub binary lives in a fixed install
 * path on Windows). The Hub CLI (`Unity Hub.exe -- --headless editors
 * --installed`) lists installed editors but it's a GUI process invoked
 * non-interactively, with quirky output â€” we fall back to parsing
 * `%APPDATA%\UnityHub\editors-v2.json` when present.
 *
 * Latest version lookup goes to Unity's public release feed. Items are
 * `manual: true`: the Hub itself is the only safe path to install/upgrade
 * an editor (it manages modules, license activation, etc.).
 */
export class UnityHubProvider implements Provider {
  readonly id = "unity-hub";
  readonly displayName = "Unity Editor (via Hub)";
  readonly installHint = "https://unity.com/unity-hub";
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
      message: "Mettre Ã  jour depuis Unity Hub (Installs â†’ â‹® â†’ Install Editor).",
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
    process.env["PROGRAMFILES"] && join(process.env["PROGRAMFILES"], "Unity Hub", "Unity Hub.exe"),
    process.env["PROGRAMFILES(X86)"] && join(process.env["PROGRAMFILES(X86)"], "Unity Hub", "Unity Hub.exe"),
  ].filter((p): p is string => typeof p === "string");
  return candidates.find((p) => existsSync(p)) ?? null;
}

function editorsConfigFile(): string {
  const appdata = process.env["APPDATA"];
  return appdata ? join(appdata, "UnityHub", "editors-v2.json") : "";
}

async function listInstalledEditors(): Promise<InstalledEditor[]> {
  // Prefer the JSON the Hub maintains â€” no process spawn, no GUI dance.
  const cfg = editorsConfigFile();
  if (existsSync(cfg)) {
    try {
      const raw = await readFile(cfg, "utf8");
      const data = JSON.parse(raw) as Record<
        string,
        { version?: string; location?: string[] }
      >;
      const out: InstalledEditor[] = [];
      for (const [version, info] of Object.entries(data)) {
        if (!version) continue;
        const loc = info?.location?.[0];
        out.push(loc ? { version, path: loc } : { version });
      }
      if (out.length > 0) return out;
    } catch {
      /* fall through to CLI */
    }
  }

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
