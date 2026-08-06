import { commandExists, run, runInherit } from "../../core/runner.js";
import { pickInstallHint } from "../../core/install-hint.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

/**
 * Flutter SDK. `flutter --version --machine` returns JSON; we use the
 * channel + version. Self-update via `flutter upgrade`.
 *
 * Detection of "outdated" uses Flutter's own `flutter upgrade --verify-only`
 * (added in 3.20+) when available, fallback: compare `frameworkVersion`
 * against the channel's latest from storage.googleapis.com.
 */
interface FlutterMachineVersion {
  frameworkVersion?: string;
  channel?: string;
}

interface FlutterReleases {
  current_release?: {
    beta?: string;
    dev?: string;
    stable?: string;
    master?: string;
  };
  releases?: Array<{
    hash?: string;
    channel?: string;
    version?: string;
  }>;
}

export class FlutterProvider implements Provider {
  readonly id = "flutter";
  readonly displayName = "Flutter SDK";
  readonly installHint = pickInstallHint({
    win32: "https://docs.flutter.dev/get-started/install",
    fallback: "brew install --cask flutter",
  });

  async isAvailable(): Promise<boolean> {
    return commandExists("flutter");
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const { stdout, failed } = await run("flutter", ["--version", "--machine"]);
    if (failed) return [];

    let parsed: FlutterMachineVersion;
    try {
      parsed = JSON.parse(stdout) as FlutterMachineVersion;
    } catch {
      return [];
    }
    const current = parsed.frameworkVersion;
    const channel = parsed.channel ?? "stable";
    if (!current) return [];

    const latest = await fetchFlutterLatest(channel);
    if (!latest || latest === current) return [];

    return [
      {
        id: "flutter",
        name: "Flutter",
        current,
        latest,
        note: `channel ${channel}`,
      },
    ];
  }

  async update(_packageId: string): Promise<UpdateOutcome> {
    const res = await runInherit("flutter", ["upgrade"]);
    return { id: "flutter", success: !res.failed };
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    return [await this.update("flutter")];
  }
}

async function fetchFlutterLatest(channel: string): Promise<string | null> {
  try {
    const res = await fetch(
      "https://storage.googleapis.com/flutter_infra_release/releases/releases_windows.json",
      { signal: AbortSignal.timeout(5_000) },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as FlutterReleases;
    const hash = data.current_release?.[channel as keyof typeof data.current_release];
    if (!hash) return null;
    const entry = data.releases?.find((r) => r.hash === hash && r.channel === channel);
    return entry?.version ?? null;
  } catch {
    return null;
  }
}
