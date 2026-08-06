import { commandExists, run } from "../../core/runner.js";
import {
  delegateUpdate,
  describeSource,
  detectInstallSource,
} from "../../core/install-source.js";
import { pickInstallHint } from "../../core/install-hint.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

interface GiteaReleaseJson {
  tag_name?: string;
}

/**
 * Gitea CLI (`tea`). Hosted on gitea.com, not GitHub — we hit its native
 * Gitea API for the latest release tag.
 *
 * `tea --version` prints "Tea version 0.9.2".
 */
export class TeaProvider implements Provider {
  readonly id = "tea";
  readonly displayName = "Gitea CLI (tea)";
  readonly installHint = pickInstallHint({
    win32: "scoop install tea",
    fallback: "brew install tea",
  });

  async isAvailable(): Promise<boolean> {
    return commandExists("tea");
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const { stdout, failed } = await run("tea", ["--version"]);
    if (failed) return [];

    const match = stdout.match(/tea\s+version\s+v?([0-9][\w.+-]*)/i);
    const current = match?.[1];
    if (!current) return [];

    const latest = await fetchGiteaLatest("gitea", "tea");
    if (!latest || latest === current) return [];

    const source = await detectInstallSource("tea");
    return [
      {
        id: "tea",
        name: "Gitea CLI",
        current,
        latest,
        note: describeSource(source),
        ...(source === "manual" && { manual: true }),
      },
    ];
  }

  async update(_packageId: string): Promise<UpdateOutcome> {
    return delegateUpdate({
      id: "tea",
      binary: "tea",
      packageIds: {
        scoop: "tea",
        // Formule homebrew-core `tea` = le CLI Gitea (gitea.com/gitea/tea).
        brew: "tea",
      },
      manualMessage:
        "Télécharger https://gitea.com/gitea/tea/releases et remplacer tea.exe",
    });
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    return [await this.update("tea")];
  }
}

async function fetchGiteaLatest(owner: string, repo: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://gitea.com/api/v1/repos/${owner}/${repo}/releases/latest`,
      {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(5_000),
      },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as GiteaReleaseJson;
    return data.tag_name?.replace(/^v/i, "") ?? null;
  } catch {
    return null;
  }
}
