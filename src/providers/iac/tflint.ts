import { commandExists, run } from "../../core/runner.js";
import {
  delegateUpdate,
  describeSource,
  detectInstallSource,
} from "../../core/install-source.js";
import { fetchGitHubReleaseLatest } from "../../core/gh-releases.js";
import { pickInstallHint } from "../../core/install-hint.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

/**
 * TFLint (Terraform linter). No self-update — delegate to the source PM.
 * Version output (first line): "TFLint version 0.50.3"
 */
export class TFLintProvider implements Provider {
  readonly id = "tflint";
  readonly displayName = "TFLint";
  // Pas de formule "tflint" dans homebrew-core : on renvoie vers la doc
  // amont plutôt que d'annoncer une commande brew qui n'existe pas.
  readonly installHint = pickInstallHint({
    win32: "winget install TerraformLinters.tflint",
    fallback: "https://github.com/terraform-linters/tflint#installation",
  });

  async isAvailable(): Promise<boolean> {
    return commandExists("tflint");
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const { stdout, failed } = await run("tflint", ["--version"]);
    if (failed) return [];

    const match = stdout.match(/TFLint\s+version\s+v?([0-9][\w.+-]*)/i);
    const current = match?.[1];
    if (!current) return [];

    const latest = await fetchGitHubReleaseLatest("terraform-linters/tflint");
    if (!latest || latest === current) return [];

    const source = await detectInstallSource("tflint");
    return [
      {
        id: "tflint",
        name: "TFLint",
        current,
        latest,
        note: describeSource(source),
        ...(source === "manual" && { manual: true }),
      },
    ];
  }

  async update(_packageId: string): Promise<UpdateOutcome> {
    return delegateUpdate({
      id: "tflint",
      binary: "tflint",
      packageIds: {
        scoop: "tflint",
        choco: "tflint",
        winget: "TerraformLinters.tflint",
        // Volontairement pas de `brew`: aucune formule "tflint" n'existe dans
        // homebrew-core et le tap amont n'a pas pu être vérifié. Un id faux
        // ferait upgrader autre chose ; sans id on retombe sur le message
        // manuel, ce qui est le comportement sûr.
      },
      manualMessage:
        "Télécharger https://github.com/terraform-linters/tflint/releases et remplacer tflint.exe",
    });
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    return [await this.update("tflint")];
  }
}
