import { commandExists, run } from "../../core/runner.js";
import {
  delegateUpdate,
  describeSource,
  detectInstallSource,
} from "../../core/install-source.js";
import { fetchHashicorpLatest } from "../../core/hashicorp-releases.js";
import { pickInstallHint } from "../../core/install-hint.js";
import { MANUAL_STEPS } from "../manual-steps.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

/**
 * HashiCorp Boundary. No self-update.
 * Version output: "Version information:\n  ... Version Number:  0.16.0"
 * Older builds also accept "boundary version" with a header line like
 * "Boundary v0.16.0".
 */
export class BoundaryProvider implements Provider {
  readonly id = "boundary";
  readonly displayName = "Boundary";
  // HashiCorp tools left homebrew-core: they now live only in the
  // hashicorp/tap tap, hence the explicit `brew tap` in the hint.
  readonly installHint = pickInstallHint({
    win32: "winget install HashiCorp.Boundary",
    fallback: "brew tap hashicorp/tap && brew install boundary",
  });

  async isAvailable(): Promise<boolean> {
    return commandExists("boundary");
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const { stdout, failed } = await run("boundary", ["version"]);
    if (failed) return [];

    const current =
      stdout.match(/Version\s+Number:\s*v?([0-9][\w.+-]*)/i)?.[1] ??
      stdout.match(/Boundary\s+v?([0-9][\w.+-]*)/i)?.[1];
    if (!current) return [];

    const latest = await fetchHashicorpLatest("boundary");
    if (!latest) return [];
    const normLatest = latest.replace(/^v/, "");
    if (normLatest === current) return [];

    const source = await detectInstallSource("boundary");
    return [
      {
        id: "boundary",
        name: "Boundary",
        current,
        latest: normLatest,
        note: describeSource(source),
        ...(source === "manual" && { manual: true }),
      },
    ];
  }

  async update(_packageId: string): Promise<UpdateOutcome> {
    return delegateUpdate({
      id: "boundary",
      binary: "boundary",
      packageIds: {
        scoop: "boundary",
        choco: "boundary",
        winget: "HashiCorp.Boundary",
        // Formula from the hashicorp/tap tap: once installed, the short name
        // is enough for `brew upgrade`.
        brew: "boundary",
      },
      manualMessage: MANUAL_STEPS.downloadAndReplace(
        "https://releases.hashicorp.com/boundary/",
        "boundary.exe",
      ),
    });
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    return [await this.update("boundary")];
  }
}
