import { commandExists, run, runInherit } from "../../core/runner.js";
import { fetchGitHubReleaseLatest } from "../../core/gh-releases.js";
import { pickInstallHint } from "../../core/install-hint.js";
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
  readonly installHint = pickInstallHint({
    win32: "winget install ArduinoSA.CLI",
    fallback: "brew install arduino-cli",
  });
  readonly slow = true;

  async isAvailable(): Promise<boolean> {
    return commandExists("arduino-cli");
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const self = await selfUpdate();
    const entries = await outdatedEntries();
    return [...self, ...platformUpdates(entries), ...libraryUpdates(entries)];
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

// ---------------------------------------------------------------------------
// listOutdated — steps
//
// Three independent sources (the binary itself, platforms, libraries) rather
// than one method: each has its own parsing and its own failure mode, and none
// of them should be able to take the others down.

/** The arduino-cli binary itself, compared against the latest GitHub release. */
async function selfUpdate(): Promise<OutdatedPackage[]> {
  const ver = await run("arduino-cli", ["version", "--format", "json"]);
  if (ver.failed) return [];
  const current = parseJson<ArduinoVersion>(ver.stdout)?.VersionString;
  if (!current) return [];
  const latest = await fetchGitHubReleaseLatest("arduino/arduino-cli");
  if (!latest || latest === current) return [];
  return [{ id: "arduino-cli", name: "Arduino CLI", current, latest }];
}

async function outdatedEntries(): Promise<ArduinoOutdatedEntry | null> {
  const res = await run("arduino-cli", ["outdated", "--format", "json"]);
  if (res.failed || !res.stdout.trim()) return null;
  return parseJson<ArduinoOutdatedEntry>(res.stdout);
}

function platformUpdates(entry: ArduinoOutdatedEntry | null): OutdatedPackage[] {
  return (entry?.Platforms ?? [])
    .filter((p) => p.ID && p.Installed && p.Latest && p.Installed !== p.Latest)
    .map((p) => ({
      id: `platform:${p.ID!}`,
      name: p.ID!,
      current: p.Installed!,
      latest: p.Latest!,
      note: "platform",
    }));
}

interface LibraryVersions {
  name?: string | undefined;
  current?: string | undefined;
  latest?: string | undefined;
}

/** A library is only surfaced when all three fields are present and differ. */
function isUpgradableLibrary(
  v: LibraryVersions,
): v is { name: string; current: string; latest: string } {
  return Boolean(v.name && v.current && v.latest && v.current !== v.latest);
}

function libraryUpdates(entry: ArduinoOutdatedEntry | null): OutdatedPackage[] {
  return (entry?.Libraries ?? [])
    .map((l) => ({
      name: l.Library?.Name,
      current: l.Library?.Version,
      latest: l.Release?.Version,
    }))
    .filter(isUpgradableLibrary)
    .map(({ name, current, latest }) => ({
      id: `lib:${name}`,
      name,
      current,
      latest,
      note: "library",
    }));
}

/** Lenient JSON: unreadable output means "nothing to report". */
function parseJson<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
