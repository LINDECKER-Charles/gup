import { commandExists, run, runInherit } from "../../core/runner.js";
import { fetchGitHubReleaseLatest } from "../../core/gh-releases.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";



interface ArduinoOutdatedEntry {
  Platforms?: Array<{ ID?: string; Installed?: string; Latest?: string }>;
  Libraries?: Array<{ Library?: { Name?: string; Version?: string }; Release?: { Version?: string } }>;
}

interface ArduinoVersion {
  VersionString?: string;
}

/**
 * Arduino CLI. Covers three distinct update surfaces:
 *  1. The CLI binary itself (compared against the latest GH release).
 *  2. Installed board "platforms" (cores).
 *  3. Installed libraries.
 *
 * For (2) and (3) we run `arduino-cli outdated --format json` once.
 * Update is delegated to `arduino-cli upgrade` (cores + libs in one shot).
 */
export class ArduinoCliProvider implements Provider {
  readonly id = "arduino-cli";
  readonly displayName = "Arduino CLI";
  readonly installHint = "winget install ArduinoSA.CLI";
  readonly slow = true;

  async isAvailable(): Promise<boolean> {
    return commandExists("arduino-cli");
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const out: OutdatedPackage[] = [];

    const ver = await run("arduino-cli", ["version", "--format", "json"]);
    if (!ver.failed) {
      try {
        const parsed = JSON.parse(ver.stdout) as ArduinoVersion;
        const current = parsed.VersionString;
        if (current) {
          const latest = await fetchGitHubReleaseLatest("arduino/arduino-cli");
          if (latest && latest !== current) {
            out.push({
              id: "arduino-cli",
              name: "Arduino CLI",
              current,
              latest,
            });
          }
        }
      } catch {
        /* swallow */
      }
    }

    const outdated = await run("arduino-cli", ["outdated", "--format", "json"]);
    if (!outdated.failed && outdated.stdout.trim()) {
      try {
        const parsed = JSON.parse(outdated.stdout) as ArduinoOutdatedEntry;
        for (const p of parsed.Platforms ?? []) {
          if (p.ID && p.Installed && p.Latest && p.Installed !== p.Latest) {
            out.push({
              id: `platform:${p.ID}`,
              name: p.ID,
              current: p.Installed,
              latest: p.Latest,
              note: "platform",
            });
          }
        }
        for (const l of parsed.Libraries ?? []) {
          const name = l.Library?.Name;
          const current = l.Library?.Version;
          const latest = l.Release?.Version;
          if (name && current && latest && current !== latest) {
            out.push({
              id: `lib:${name}`,
              name,
              current,
              latest,
              note: "library",
            });
          }
        }
      } catch {
        /* swallow */
      }
    }
    return out;
  }

  async update(packageId: string): Promise<UpdateOutcome> {
    if (packageId === "arduino-cli") {
      // Self-update path varies by install method; defer to bulk upgrade.
      const res = await runInherit("arduino-cli", ["upgrade"]);
      return { id: packageId, success: !res.failed };
    }
    if (packageId.startsWith("platform:")) {
      const id = packageId.slice("platform:".length);
      const res = await runInherit("arduino-cli", ["core", "upgrade", id]);
      return { id: packageId, success: !res.failed };
    }
    if (packageId.startsWith("lib:")) {
      const id = packageId.slice("lib:".length);
      const res = await runInherit("arduino-cli", ["lib", "upgrade", id]);
      return { id: packageId, success: !res.failed };
    }
    return { id: packageId, success: false, message: "id inconnu" };
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    const res = await runInherit("arduino-cli", ["upgrade"]);
    return packages.map((p) => ({ id: p.id, success: !res.failed }));
  }
}
