import { commandExists, run } from "../../core/runner.js";
import {
  delegateUpdate,
  describeSource,
  detectInstallSource,
  installedByField,
} from "../../core/install-source.js";
import { fetchGitHubReleaseLatest } from "../../core/gh-releases.js";
import { pickInstallHint } from "../../core/install-hint.js";
import { MANUAL_STEPS } from "../manual-steps.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

/**
 * Flux CLI (GitOps). Version line: "flux version 2.3.0".
 */
export class FluxProvider implements Provider {
  readonly id = "flux";
  readonly displayName = "Flux CLI";
  // Careful: the homebrew-core `flux` formula is InfluxData's query language,
  // not FluxCD. The GitOps CLI only lives in fluxcd/tap, hence the fully
  // qualified name everywhere below.
  readonly installHint = pickInstallHint({
    win32: "winget install FluxCD.Flux",
    fallback: "brew install fluxcd/tap/flux",
  });

  async isAvailable(): Promise<boolean> {
    return commandExists("flux");
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const { stdout, failed } = await run("flux", ["--version"]);
    if (failed) return [];

    const match = stdout.match(
      // eslint-disable-next-line security/detect-unsafe-regex -- bounded quantifiers, no nested repetition; safe-regex false positive
      /v?([0-9]+\.[0-9]+\.[0-9]+(?:-[A-Za-z0-9.-]+)?)/,
    );
    const current = match?.[1];
    if (!current) return [];

    const latest = await fetchGitHubReleaseLatest("fluxcd/flux2");
    if (!latest || latest === current) return [];

    const source = await detectInstallSource("flux");
    return [
      {
        id: "flux",
        name: "Flux CLI",
        current,
        latest,
        note: describeSource(source),
        ...installedByField(source),
        ...(source === "manual" && { manual: true }),
      },
    ];
  }

  async update(_packageId: string): Promise<UpdateOutcome> {
    return delegateUpdate({
      id: "flux",
      binary: "flux",
      packageIds: {
        scoop: "flux",
        choco: "flux",
        winget: "FluxCD.Flux",
        brew: "fluxcd/tap/flux",
      },
      manualMessage: MANUAL_STEPS.downloadAndReplace(
        "https://github.com/fluxcd/flux2/releases",
        "flux.exe",
      ),
    });
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    return [await this.update("flux")];
  }
}
