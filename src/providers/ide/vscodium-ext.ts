import { pickInstallHint } from "../../core/install-hint.js";
import { commandExists } from "../../core/runner.js";
import {
  fetchOpenVsxLatest,
  scanVsCodeLikeExtensions,
  updateVsCodeLikeExtension,
} from "./vscode-like.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

/**
 * VSCodium (telemetry-free VS Code build). Defaults to the Open VSX gallery
 * instead of the Microsoft Marketplace.
 */
export class VsCodiumExtProvider implements Provider {
  readonly id = "vscodium-ext";
  readonly displayName = "VSCodium extensions";
  readonly installHint = pickInstallHint({
    win32: "https://vscodium.com/",
    darwin: "brew install --cask vscodium",
    fallback: "https://vscodium.com/",
  });
  readonly slow = true;

  async isAvailable(): Promise<boolean> {
    return commandExists("codium");
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    return scanVsCodeLikeExtensions({
      binary: "codium",
      fetchLatest: fetchOpenVsxLatest,
    });
  }

  async update(packageId: string): Promise<UpdateOutcome> {
    return updateVsCodeLikeExtension("codium", packageId);
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    const outcomes: UpdateOutcome[] = [];
    for (const pkg of packages) outcomes.push(await this.update(pkg.id));
    return outcomes;
  }
}
