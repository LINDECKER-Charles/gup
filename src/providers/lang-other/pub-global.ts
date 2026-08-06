import pLimit from "p-limit";
import { commandExists, run, runInherit } from "../../core/runner.js";
import { pickInstallHint } from "../../core/install-hint.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

interface PubApiVersion {
  latest?: { version?: string };
}

/**
 * Dart `pub global` packages. `dart pub global list` outputs
 *   "<pkg> <version>" per line (no header). Latest is fetched from pub.dev.
 */
export class PubGlobalProvider implements Provider {
  readonly id = "pub-global";
  readonly displayName = "Dart pub global";
  readonly installHint = pickInstallHint({
    win32: "Installer Dart/Flutter SDK",
    fallback: "brew install dart-sdk (ou brew install --cask flutter)",
  });
  readonly slow = true;

  async isAvailable(): Promise<boolean> {
    // Dart is bundled with Flutter; either binary is fine.
    return (await commandExists("dart")) || (await commandExists("flutter"));
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const bin = (await commandExists("dart")) ? "dart" : "flutter";
    const { stdout, failed } = await run(bin, ["pub", "global", "list"]);
    if (failed) return [];

    const installed: Array<{ name: string; current: string }> = [];
    for (const rawLine of stdout.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line) continue;
      const m = line.match(/^([a-z0-9_]+)\s+(\d[\w.+-]*)/i);
      if (!m) continue;
      const [, name, current] = m;
      if (!name || !current) continue;
      installed.push({ name, current });
    }
    if (installed.length === 0) return [];

    const limit = pLimit(6);
    const results = await Promise.all(
      installed.map((p) =>
        limit(async (): Promise<OutdatedPackage | null> => {
          const latest = await fetchPubLatest(p.name);
          if (!latest || latest === p.current) return null;
          return { id: p.name, name: p.name, current: p.current, latest };
        }),
      ),
    );
    return results.filter((r): r is OutdatedPackage => r !== null);
  }

  async update(packageId: string): Promise<UpdateOutcome> {
    const bin = (await commandExists("dart")) ? "dart" : "flutter";
    const res = await runInherit(bin, ["pub", "global", "activate", packageId]);
    return { id: packageId, success: !res.failed };
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    const outcomes: UpdateOutcome[] = [];
    for (const pkg of packages) outcomes.push(await this.update(pkg.id));
    return outcomes;
  }
}

async function fetchPubLatest(pkg: string): Promise<string | null> {
  try {
    const res = await fetch(`https://pub.dev/api/packages/${encodeURIComponent(pkg)}`, {
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as PubApiVersion;
    return data.latest?.version ?? null;
  } catch {
    return null;
  }
}
