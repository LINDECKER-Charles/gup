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
 *  - When gup supports the source on some OSes only, declare it on one line:
 *    `readonly platforms = PLATFORMS.windows;` (or `macos`, `notWindows`; from
 *    `core/platform/platforms.ts`). The registry then never probes, scans or
 *    updates it elsewhere, and listings grey it out. Never test
 *    `process.platform` in isAvailable() to the same end. Its `installHint`
 *    only covers those OSes: no pickInstallHint() key gup can never show,
 *    and a plain string when a single hint is left.
 *  - Return `skipped: true` from update() when the action requires user input
 *    outside the provider (manual download, GUI tool, etc.).
 *  - Avoid throwing in listOutdated/update. Return empty list / failed outcome
 *    instead so other providers keep working. Throw only when the tool itself
 *    reports its scan failed (an error object, an error code): the registry
 *    then shows that message as the provider's scan error, not as "up to date".
 *  - Words shown to the user exist in every language of the interface
 *    (English, French) and are read when they are shown, never when the
 *    module loads: the registry instantiates every provider at import, before
 *    startup picks the language. A message is built where it is returned, with
 *    `localize({ en, fr })` (or a module-level `localized({ en: {…}, fr: {…} })`
 *    catalog, read inside the method); an `installHint` with words around its
 *    command is a getter. A bare command or URL stays a plain field and is
 *    never translated. Steps many providers suggest (download and replace a
 *    binary, rerun as administrator…) are worded once in `manual-steps.ts`.
 */
import { commandExists, run, runInherit } from "../core/runner.js";
import { localize } from "../core/i18n/localized.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../core/types.js";

export class TemplateProvider implements Provider {
  readonly id = "template";
  readonly displayName = "Template";
  // A hint that is only a command can stay a field: `readonly installHint = "brew install x";`
  get installHint(): string {
    return localize({
      en: "Install the upstream tool: URL or one-liner",
      fr: "Installer l'outil amont : URL ou commande",
    });
  }
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
    if (!res.failed) return { id: packageId, success: true };
    return {
      id: packageId,
      success: false,
      message: localize({
        en: `template-bin could not upgrade ${packageId}`,
        fr: `template-bin n'a pas pu mettre à jour ${packageId}`,
      }),
    };
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    // Prefer a single bulk command when the underlying tool supports it.
    const res = await runInherit("template-bin", ["upgrade", "--all"]);
    return packages.map((p) => ({ id: p.id, success: !res.failed }));
  }
}
