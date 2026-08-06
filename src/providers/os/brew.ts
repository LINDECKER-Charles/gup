import { commandExists, run, runInherit } from "../../core/runner.js";
import { pickInstallHint } from "../../core/install-hint.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

/**
 * Envelope returned by `brew outdated --json=v2`. Both keys are always
 * present, and `--formula` / `--cask` only decide which one gets filled —
 * so the shape is shared with {@link BrewCaskProvider}.
 */
export interface BrewOutdatedJson {
  formulae?: BrewOutdatedEntry[];
  casks?: BrewOutdatedEntry[];
}

export interface BrewOutdatedEntry {
  name?: string;
  /** Every version currently installed; the last one is the active keg. */
  installed_versions?: string[];
  /** Some cask payloads use the singular form instead of the array. */
  installed_version?: string;
  current_version?: string;
  pinned?: boolean;
}

/**
 * Homebrew formulae — the primary package manager on macOS, and the reason
 * most CLI tools on a Mac are upgradable at all. Also covers Linuxbrew
 * (`/home/linuxbrew/.linuxbrew`), so this provider is not gated on darwin.
 *
 * Scan cost: `brew outdated` reads the local formula index, but Homebrew
 * auto-updates that index on its own schedule (`HOMEBREW_AUTO_UPDATE_SECS`,
 * once a day by default) before answering. We deliberately do NOT override
 * that with `HOMEBREW_NO_AUTO_UPDATE=1`: a scan against a stale index would
 * silently report "nothing to update", which is exactly the failure mode this
 * provider exists to remove. Users who want a strictly offline scan already
 * export that variable themselves, and we inherit it.
 */
export class BrewProvider implements Provider {
  readonly id = "brew";
  readonly displayName = "Homebrew";
  readonly installHint = pickInstallHint({
    win32: "Homebrew ne cible pas Windows — utiliser winget/scoop, ou WSL (provider wsl-brew).",
    fallback:
      'https://brew.sh — /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"',
  });

  async isAvailable(): Promise<boolean> {
    // Homebrew targets macOS and Linux only. The explicit win32 exclusion is
    // not cosmetic: people do put a `brew.cmd` shim on the Windows PATH to
    // forward into WSL (that bridge is what the `wsl-brew` provider covers),
    // and without this guard such a shim would make gup run `brew outdated`
    // and `brew upgrade` on Windows — commands this provider never issued
    // there before.
    if (process.platform === "win32") return false;
    return commandExists("brew");
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const { stdout, failed } = await run("brew", [
      "outdated",
      "--formula",
      "--json=v2",
    ]);
    if (failed && !stdout) return [];
    return parseBrewOutdated(stdout, "formulae");
  }

  async update(packageId: string): Promise<UpdateOutcome> {
    const res = await runInherit("brew", ["upgrade", "--formula", packageId]);
    return { id: packageId, success: !res.failed };
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    // `brew upgrade --formula` handles the whole set in one resolution pass
    // (shared dependencies get built once) and skips pinned formulae itself.
    const res = await runInherit("brew", ["upgrade", "--formula"]);
    return packages.map((p) => ({ id: p.id, success: !res.failed }));
  }
}

/**
 * Parse one side of the `brew outdated --json=v2` envelope.
 *
 * Tolerates a truncated or non-JSON payload (brew prints hints and the
 * auto-update banner to stderr, but a broken install can still garble
 * stdout) by returning an empty list rather than throwing mid-scan.
 */
export function parseBrewOutdated(
  stdout: string,
  key: "formulae" | "casks",
): OutdatedPackage[] {
  let payload: BrewOutdatedJson;
  try {
    payload = JSON.parse(stdout) as BrewOutdatedJson;
  } catch {
    return [];
  }

  const entries = payload[key];
  if (!Array.isArray(entries)) return [];

  const out: OutdatedPackage[] = [];
  for (const entry of entries) {
    const id = entry?.name;
    const latest = entry?.current_version;
    if (!id || !latest) continue;
    const current = installedVersion(entry);
    if (!current) continue;
    out.push({
      id,
      name: id,
      current,
      latest,
      // Pinned formulae are reported by `brew outdated` but refused by
      // `brew upgrade`. Surfaced with a note (same contract as winget pins)
      // so the user sees the drift instead of it vanishing from the table.
      ...(entry.pinned === true && { note: "pinned" }),
    });
  }
  return out;
}

/**
 * Highest installed version. Homebrew keeps every installed keg listed, so
 * the last entry is the one currently linked.
 */
function installedVersion(entry: BrewOutdatedEntry): string | undefined {
  const versions = entry.installed_versions;
  if (Array.isArray(versions) && versions.length > 0) {
    return versions[versions.length - 1];
  }
  return entry.installed_version;
}
