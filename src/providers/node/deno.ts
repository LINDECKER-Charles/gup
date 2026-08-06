import { pickInstallHint } from "../../core/install-hint.js";
import { commandExists, run, runInherit } from "../../core/runner.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

interface GitHubReleaseJson {
  tag_name?: string;
}

/**
 * Deno bundles its own self-updater. We compare the installed runtime
 * version against the latest GitHub release tag.
 */
export class DenoProvider implements Provider {
  readonly id = "deno";
  readonly displayName = "Deno";
  readonly installHint = pickInstallHint({
    win32: "https://deno.com",
    fallback: "brew install deno",
  });

  async isAvailable(): Promise<boolean> {
    return commandExists("deno");
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const { stdout, failed } = await run("deno", ["--version"]);
    if (failed) return [];

    // First line: "deno 1.46.3 (release, x86_64-pc-windows-msvc)"
    const m = stdout.split(/\r?\n/)[0]?.match(/deno\s+(\d[\w.+-]*)/i);
    const current = m?.[1];
    if (!current) return [];

    const latest = await fetchDenoLatest();
    if (!latest || latest === current) return [];
    return [{ id: "deno", name: "Deno", current, latest }];
  }

  async update(_packageId: string): Promise<UpdateOutcome> {
    const res = await runInherit("deno", ["upgrade"]);
    return { id: "deno", success: !res.failed };
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    return [await this.update("deno")];
  }
}

async function fetchDenoLatest(): Promise<string | null> {
  try {
    const res = await fetch("https://api.github.com/repos/denoland/deno/releases/latest", {
      headers: { accept: "application/vnd.github+json" },
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as GitHubReleaseJson;
    return data.tag_name?.replace(/^v/, "") ?? null;
  } catch {
    return null;
  }
}
