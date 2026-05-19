import { commandExists } from "../../core/runner.js";
import {
  fetchMicrosoftMarketplaceLatest,
  scanVsCodeLikeExtensions,
  updateVsCodeLikeExtension,
} from "./vscode-like.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

/**
 * Windsurf (Codeium's VS Code fork). Same extension CLI + Microsoft
 * Marketplace.
 */
export class WindsurfExtProvider implements Provider {
  readonly id = "windsurf-ext";
  readonly displayName = "Windsurf extensions";
  readonly installHint = "https://codeium.com/windsurf";
  readonly slow = true;

  async isAvailable(): Promise<boolean> {
    return commandExists("windsurf");
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    return scanVsCodeLikeExtensions({
      binary: "windsurf",
      fetchLatest: fetchMicrosoftMarketplaceLatest,
    });
  }

  async update(packageId: string): Promise<UpdateOutcome> {
    return updateVsCodeLikeExtension("windsurf", packageId);
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    const outcomes: UpdateOutcome[] = [];
    for (const pkg of packages) outcomes.push(await this.update(pkg.id));
    return outcomes;
  }
}
