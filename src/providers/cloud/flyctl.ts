import { commandExists, run, runInherit } from "../../core/runner.js";
import { fetchGitHubReleaseLatest } from "../../core/gh-releases.js";
import { pickInstallHint } from "../../core/install-hint.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

/**
 * Fly.io CLI (`flyctl` / `fly`). Has built-in self-update via
 * `fly version upgrade`. We use `fly` as the canonical binary since recent
 * installs alias it, falling back to `flyctl`.
 *
 * Version line: "fly v0.2.45 windows/amd64 Commit: ... BuildDate: ..."
 */
export class FlyctlProvider implements Provider {
  readonly id = "flyctl";
  readonly displayName = "Fly.io CLI";
  readonly installHint = pickInstallHint({
    win32: "https://fly.io/docs/hands-on/install-flyctl/",
    fallback: "brew install flyctl",
  });

  private async bin(): Promise<string | null> {
    if (await commandExists("fly")) return "fly";
    if (await commandExists("flyctl")) return "flyctl";
    return null;
  }

  async isAvailable(): Promise<boolean> {
    return (await this.bin()) !== null;
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const bin = await this.bin();
    if (!bin) return [];

    const { stdout, failed } = await run(bin, ["version"]);
    if (failed) return [];

    const match = stdout.match(
      // eslint-disable-next-line security/detect-unsafe-regex -- bounded quantifiers, no nested repetition; safe-regex false positive
      /v?([0-9]+\.[0-9]+\.[0-9]+(?:-[A-Za-z0-9.-]+)?)/,
    );
    const current = match?.[1];
    if (!current) return [];

    const latest = await fetchGitHubReleaseLatest("superfly/flyctl");
    if (!latest || latest === current) return [];

    return [{ id: "flyctl", name: "Fly.io CLI", current, latest }];
  }

  async update(_packageId: string): Promise<UpdateOutcome> {
    const bin = await this.bin();
    if (!bin) {
      return {
        id: "flyctl",
        success: false,
        skipped: true,
        message: "fly/flyctl introuvable",
      };
    }
    const res = await runInherit(bin, ["version", "upgrade"]);
    return { id: "flyctl", success: !res.failed };
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    return [await this.update("flyctl")];
  }
}
