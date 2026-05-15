import pLimit from "p-limit";
import { commandExists, run, runInherit } from "../core/runner.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../core/types.js";

/**
 * VS Code auto-updates extensions by default, but users with "extensions.autoUpdate": false
 * (common in locked-down corporate setups) miss updates entirely.
 *
 * The Marketplace gallery API is undocumented but stable; we POST a minimal
 * query and parse `versions[0].version` per extension.
 */
export class VsCodeExtProvider implements Provider {
  readonly id = "vscode-ext";
  readonly displayName = "VS Code extensions";
  readonly installHint = "VS Code: https://code.visualstudio.com";

  async isAvailable(): Promise<boolean> {
    return commandExists("code");
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const { stdout } = await run("code", ["--list-extensions", "--show-versions"]);
    const installed = stdout
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.includes("@"))
      .map((l) => {
        const at = l.lastIndexOf("@");
        return { id: l.slice(0, at), current: l.slice(at + 1) };
      });
    if (installed.length === 0) return [];

    const limit = pLimit(8);
    const results = await Promise.all(
      installed.map((ext) =>
        limit(async (): Promise<OutdatedPackage | null> => {
          const latest = await fetchMarketplaceLatest(ext.id);
          if (!latest || latest === ext.current) return null;
          return { id: ext.id, name: ext.id, current: ext.current, latest };
        }),
      ),
    );
    return results.filter((r): r is OutdatedPackage => r !== null);
  }

  async update(packageId: string): Promise<UpdateOutcome> {
    const res = await runInherit("code", ["--install-extension", packageId, "--force"]);
    return { id: packageId, success: !res.failed };
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    const outcomes: UpdateOutcome[] = [];
    for (const pkg of packages) outcomes.push(await this.update(pkg.id));
    return outcomes;
  }
}

async function fetchMarketplaceLatest(extensionId: string): Promise<string | null> {
  const body = {
    filters: [
      {
        criteria: [
          { filterType: 8, value: "Microsoft.VisualStudio.Code" },
          { filterType: 7, value: extensionId },
        ],
      },
    ],
    flags: 0x100,
  };
  try {
    const res = await fetch(
      "https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery",
      {
        method: "POST",
        headers: {
          Accept: "application/json;api-version=3.0-preview.1",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(5_000),
      },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      results?: Array<{
        extensions?: Array<{ versions?: Array<{ version?: string }> }>;
      }>;
    };
    return data.results?.[0]?.extensions?.[0]?.versions?.[0]?.version ?? null;
  } catch {
    return null;
  }
}
