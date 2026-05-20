/**
 * Provider template — copy this file to `<your-provider>.ts`, fill in the
 * gaps, then register the class in `src/core/registry.ts` (ALL_PROVIDERS array).
 *
 * Conventions:
 *  - One file = one provider. No shared state across providers.
 *  - `id` must be unique, kebab-case, stable (it's used in `gup update <id>:<pkg>`).
 *  - `displayName` is shown in tables / menus. Short, no marketing fluff.
 *  - Use `commandExists(...)` for isAvailable when the provider wraps a CLI.
 *  - Use `run(...)` for capturable output and `runInherit(...)` to stream the
 *    update process to the user's terminal.
 *  - Set `slow = true` if scan involves per-package HTTP calls or filesystem walks.
 *  - Return `skipped: true` from update() when the action requires user input
 *    outside the provider (manual download, GUI tool, etc.).
 *  - Avoid throwing in listOutdated/update. Return empty list / failed outcome
 *    instead so other providers keep working.
 */
import { commandExists, run, runInherit } from "../core/runner.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../core/types.js";

export class TemplateProvider implements Provider {
  readonly id = "template";
  readonly displayName = "Template";
  readonly installHint = "URL or one-liner to install the upstream tool";
  // readonly slow = true; // uncomment if scan is HTTP/IO heavy

  async isAvailable(): Promise<boolean> {
    return commandExists("template-bin");
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const { stdout, failed } = await run("template-bin", ["--list-installed-flag"]);
    if (failed) return [];

    // Parse stdout → list of { id, current, latest, name?, note? }.
    // For HTTP-based latest version lookups, prefer `fetch` with
    // `AbortSignal.timeout(5_000)` and tolerate failures gracefully.
    const outdated: OutdatedPackage[] = [];
    for (const line of stdout.split(/\r?\n/)) {
      if (!line.trim()) continue;
      // Parse `line` → push { id, current, latest, name?, note? } into `outdated`.
    }

    return outdated;
  }

  async update(packageId: string): Promise<UpdateOutcome> {
    const res = await runInherit("template-bin", ["upgrade", packageId]);
    return { id: packageId, success: !res.failed };
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    // Prefer a single bulk command when the underlying tool supports it.
    const res = await runInherit("template-bin", ["upgrade", "--all"]);
    return packages.map((p) => ({ id: p.id, success: !res.failed }));
  }
}
