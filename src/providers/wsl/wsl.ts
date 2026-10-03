import { commandExists, run, runInherit } from "../../core/runner.js";
import { pickInstallHint } from "../../core/install-hint.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";
import { PLATFORMS } from "../../core/platform/platforms.js";

/**
 * Only covers the WSL host kernel + WSL.exe — packages inside distributions
 * are out of scope (each distro has its own manager: apt, dnf, pacman...).
 */
export class WslProvider implements Provider {
  readonly id = "wsl";
  readonly displayName = "WSL (kernel)";
  readonly installHint = pickInstallHint({
    win32: "Windows feature — `wsl --install`",
    fallback: "WSL est une fonctionnalité Windows — inexistante sur cette plateforme.",
  });
  /** WSL is a Windows feature. */
  readonly platforms = PLATFORMS.windows;

  async isAvailable(): Promise<boolean> {
    if (process.platform !== "win32") return false;
    if (!(await commandExists("wsl"))) return false;
    const { failed } = await run("wsl", ["--version"]);
    return !failed;
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const { stdout } = await run("wsl", ["--version"]);
    const current = parseWslVersion(stdout);
    if (!current) return [];

    const latest = await fetchWslLatest();
    if (!latest) return [];
    const normLatest = latest.replace(/^v/, "");
    if (normLatest === current) return [];

    return [{ id: "wsl", name: "WSL", current, latest: normLatest }];
  }

  async update(_packageId: string): Promise<UpdateOutcome> {
    const res = await runInherit("wsl", ["--update"]);
    return { id: "wsl", success: !res.failed };
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    return [await this.update("wsl")];
  }
}

function parseWslVersion(output: string): string | null {
  // Output may contain BOM/encoding artefacts depending on console settings.
  const normalized = output.replace(/\u0000/g, "");
  const match = normalized.match(/WSL\s+version:\s*([0-9.]+)/i);
  return match?.[1] ?? null;
}

async function fetchWslLatest(): Promise<string | null> {
  try {
    const res = await fetch(
      "https://api.github.com/repos/microsoft/WSL/releases/latest",
      {
        signal: AbortSignal.timeout(5_000),
        headers: { Accept: "application/vnd.github+json" },
      },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { tag_name?: string };
    return data.tag_name ?? null;
  } catch {
    return null;
  }
}
