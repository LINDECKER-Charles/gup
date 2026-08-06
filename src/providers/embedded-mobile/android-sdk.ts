import { commandExists, run, runInherit } from "../../core/runner.js";
import { pickInstallHint } from "../../core/install-hint.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

/**
 * Android SDK packages managed via `sdkmanager` (command-line tools).
 *
 * `sdkmanager --list` prints three sections separated by blank-line headers:
 *   "Installed packages:", "Available Packages:", "Available Updates:".
 * Only the Updates section is parsed here — each row is fixed-width with a
 * "Package | Installed | Available" layout (column separator is `|`).
 *
 * Update path: `sdkmanager --update` upgrades every installed package in one
 * shot, which is the documented bulk command and avoids per-package licensing
 * prompts. Targeted updates re-install a specific package via
 * `sdkmanager --install "<pkg>"` since `--update` does not accept a filter.
 *
 * License prompts (`y/N`) are unavoidable on first install of new components
 * — we stream stdio so the user can accept them. `runInherit` does this.
 */
export class AndroidSdkProvider implements Provider {
  readonly id = "android-sdk";
  readonly displayName = "Android SDK";
  readonly installHint = pickInstallHint({
    win32:
      "Installer Android Studio ou les Command-line Tools (sdkmanager) — https://developer.android.com/tools",
    fallback: "brew install --cask android-commandlinetools",
  });
  readonly slow = true;

  async isAvailable(): Promise<boolean> {
    return commandExists("sdkmanager");
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const { stdout, failed } = await run("sdkmanager", ["--list"]);
    if (failed) return [];

    const updatesSection = extractUpdatesSection(stdout);
    if (!updatesSection) return [];

    const out: OutdatedPackage[] = [];
    for (const rawLine of updatesSection.split(/\r?\n/)) {
      const cols = rawLine.split("|").map((c) => c.trim());
      if (cols.length < 3) continue;
      const [id, current, latest] = cols;
      if (!id || !current || !latest) continue;
      if (id.toLowerCase() === "id") continue; // header row
      if (/^-+$/.test(id)) continue; // separator row
      out.push({ id, name: id, current, latest });
    }
    return out;
  }

  async update(packageId: string): Promise<UpdateOutcome> {
    const res = await runInherit("sdkmanager", [`--install`, packageId]);
    return { id: packageId, success: !res.failed };
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    const res = await runInherit("sdkmanager", ["--update"]);
    return packages.map((p) => ({ id: p.id, success: !res.failed }));
  }
}

function extractUpdatesSection(stdout: string): string | null {
  const lines = stdout.split(/\r?\n/);
  const startIdx = lines.findIndex((l) => /^Available Updates:/i.test(l));
  if (startIdx < 0) return null;
  // The section ends at the next blank line followed by a non-table line,
  // or at EOF. sdkmanager has no further sections after Updates, so we
  // simply take everything until a fully blank line ends the block.
  const rest = lines.slice(startIdx + 1);
  const endIdx = rest.findIndex((l) => l.trim() === "");
  const body = endIdx < 0 ? rest : rest.slice(0, endIdx);
  return body.join("\n");
}
