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
 * AWS CLI v2. `aws --version` prints:
 *   aws-cli/2.15.30 Python/3.11.8 Windows/10 exe/AMD64 prompt/off
 *
 * The bundled MSI installer has no self-update path on Windows, so we always
 * delegate the upgrade to the original package manager when known.
 */
export class AwsCliV2Provider implements Provider {
  readonly id = "aws-cli-v2";
  readonly displayName = "AWS CLI v2";
  readonly installHint = pickInstallHint({
    win32: "winget install Amazon.AWSCLI",
    fallback: "brew install awscli",
  });

  async isAvailable(): Promise<boolean> {
    return commandExists("aws");
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const { stdout, stderr, failed } = await run("aws", ["--version"]);
    if (failed) return [];

    const output = `${stdout}\n${stderr}`;
    const match = output.match(/aws-cli\/v?(2\.[0-9][\w.+-]*)/i);
    const current = match?.[1];
    if (!current) return [];

    const latest = await fetchGitHubReleaseLatest("aws/aws-cli");
    if (!latest || latest === current) return [];

    const source = await detectInstallSource("aws");
    return [
      {
        id: "aws-cli-v2",
        name: "AWS CLI v2",
        current,
        latest,
        note: describeSource(source),
        ...(source === "manual" && { manual: true }),
      },
    ];
  }

  async update(_packageId: string): Promise<UpdateOutcome> {
    return delegateUpdate({
      id: "aws-cli-v2",
      binary: "aws",
      packageIds: {
        scoop: "aws",
        choco: "awscli",
        winget: "Amazon.AWSCLI",
        brew: "awscli",
      },
      manualMessage:
        "Télécharger https://awscli.amazonaws.com/AWSCLIV2.msi et relancer l'installeur",
    });
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    return [await this.update("aws-cli-v2")];
  }
}
