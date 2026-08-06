import { pickInstallHint } from "../../core/install-hint.js";
import { commandExists } from "../../core/runner.js";
import {
  fetchMicrosoftMarketplaceLatest,
  scanVsCodeLikeExtensions,
  updateVsCodeLikeExtension,
} from "./vscode-like.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

/**
 * VS Code auto-updates extensions by default, but users with "extensions.autoUpdate": false
 * (common in locked-down corporate setups) miss updates entirely.
 *
 * Scan and update logic is shared with the VS Code forks (Cursor, Windsurf,
 * VSCodium) in `vscode-like.ts`.
 */
export class VsCodeExtProvider implements Provider {
  readonly id = "vscode-ext";
  readonly displayName = "VS Code extensions";
  // Le cask macOS n'ajoute pas `code` au PATH : c'est la palette de commandes
  // qui pose le shim, d'où le rappel explicite.
  readonly installHint = pickInstallHint({
    win32: "VS Code: https://code.visualstudio.com",
    darwin:
      "brew install --cask visual-studio-code, puis Command Palette → Shell Command: Install 'code' command in PATH",
    fallback: "VS Code: https://code.visualstudio.com",
  });
  readonly slow = true;

  async isAvailable(): Promise<boolean> {
    return commandExists("code");
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    return scanVsCodeLikeExtensions({
      binary: "code",
      fetchLatest: fetchMicrosoftMarketplaceLatest,
    });
  }

  async update(packageId: string): Promise<UpdateOutcome> {
    return updateVsCodeLikeExtension("code", packageId);
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    const outcomes: UpdateOutcome[] = [];
    for (const pkg of packages) outcomes.push(await this.update(pkg.id));
    return outcomes;
  }
}
