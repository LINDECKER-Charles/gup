import { pickInstallHint } from "../../core/install-hint.js";
import { commandExists } from "../../core/runner.js";
import {
  fetchMicrosoftMarketplaceLatest,
  scanVsCodeLikeExtensions,
  updateVsCodeLikeExtension,
} from "./vscode-like.js";
import { MANUAL_STEPS } from "../manual-steps.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

/**
 * Cursor (VS Code fork). Same extension CLI as VS Code and consumes the
 * Microsoft Marketplace.
 */
export class CursorExtProvider implements Provider {
  readonly id = "cursor-ext";
  readonly displayName = "Cursor extensions";
  // On macOS the cask installs the app but not always the `cursor` binary
  // on the PATH: the command palette is the only reliable way.
  get installHint(): string {
    return pickInstallHint({
      win32: "https://www.cursor.com/",
      darwin: MANUAL_STEPS.andThen(
        "brew install --cask cursor",
        "Cursor → Command Palette → Shell Command: Install 'cursor' command",
      ),
      fallback: "https://www.cursor.com/",
    });
  }
  readonly slow = true;

  async isAvailable(): Promise<boolean> {
    return commandExists("cursor");
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    return scanVsCodeLikeExtensions({
      binary: "cursor",
      fetchLatest: fetchMicrosoftMarketplaceLatest,
    });
  }

  async update(packageId: string): Promise<UpdateOutcome> {
    return updateVsCodeLikeExtension("cursor", packageId);
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    const outcomes: UpdateOutcome[] = [];
    for (const pkg of packages) outcomes.push(await this.update(pkg.id));
    return outcomes;
  }
}
