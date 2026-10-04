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
 * HashiCorp Consul. No self-update.
 * Version output: "Consul v1.18.1\nRevision ..."
 */
export class ConsulProvider implements Provider {
  readonly id = "consul";
  readonly displayName = "Consul";
  // HashiCorp tools left homebrew-core: they now live only in the
  // hashicorp/tap tap, hence the explicit `brew tap` in the hint.
  readonly installHint = pickInstallHint({
    win32: "winget install HashiCorp.Consul",
    fallback: "brew tap hashicorp/tap && brew install consul",
  });

  async isAvailable(): Promise<boolean> {
    return commandExists("consul");
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const { stdout, failed } = await run("consul", ["version"]);
    if (failed) return [];

    const match = stdout.match(/Consul\s+v?([0-9][\w.+-]*)/i);
    const current = match?.[1];
    if (!current) return [];

    const latest = await fetchHashicorpLatest("consul");
    if (!latest) return [];
    const normLatest = latest.replace(/^v/, "");
    if (normLatest === current) return [];

    const source = await detectInstallSource("consul");
    return [
      {
        id: "consul",
        name: "Consul",
        current,
        latest: normLatest,
        note: describeSource(source),
        ...(source === "manual" && { manual: true }),
      },
    ];
  }

  async update(_packageId: string): Promise<UpdateOutcome> {
    return delegateUpdate({
      id: "consul",
      binary: "consul",
      packageIds: {
        scoop: "consul",
        choco: "consul",
        winget: "HashiCorp.Consul",
        // Formula from the hashicorp/tap tap. The Homebrew cask named "consul"
        // is another program: never a `brewCask` here.
        brew: "consul",
      },
      manualMessage: MANUAL_STEPS.downloadAndReplace(
        "https://releases.hashicorp.com/consul/",
        "consul.exe",
      ),
    });
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    return [await this.update("consul")];
  }
}
