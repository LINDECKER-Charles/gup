import { pickInstallHint } from "../../core/install-hint.js";
import { commandExists, run, runInherit } from "../../core/runner.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";
import { restoreStagedCopy, type StagedCopyFate } from "./npm-staged-copy.js";

interface NpmOutdatedEntry {
  current?: string;
  wanted?: string;
  latest?: string;
}

/** The outcome's recovery note once npm's staged copy is back in place. */
const RESTORED_NOTE = "version précédente restaurée";

/** …and when npm had begun writing the new version: the old copy is left where npm put it. */
function keptNote(path: string): string {
  return `ancienne version mise de côté par npm dans ${path}`;
}

/**
 * Uses `npm outdated -g --json` (built-in, no `npm-check-updates` dependency).
 * Falls back gracefully when no outdated packages (npm exits 1 with empty stdout).
 *
 * An install that does not finish may leave the package moved aside by npm
 * (a skip, a stop or the install timeout kills npm before its own rollback):
 * the copy is moved back in place (`npm-staged-copy.ts`).
 */
export class NpmGlobalProvider implements Provider {
  readonly id = "npm-g";
  readonly displayName = "npm (global)";
  readonly installHint = pickInstallHint({
    win32: "Installer Node.js: https://nodejs.org",
    fallback: "brew install node",
  });
  private globalRoot: string | null = null;

  async isAvailable(): Promise<boolean> {
    return commandExists("npm");
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const { stdout } = await run("npm", [
      "outdated",
      "-g",
      "--json",
      "--long",
    ]);
    if (!stdout.trim()) return [];

    let parsed: Record<string, NpmOutdatedEntry>;
    try {
      parsed = JSON.parse(stdout) as Record<string, NpmOutdatedEntry>;
    } catch {
      return [];
    }

    return Object.entries(parsed)
      .filter(([, info]) => info.current && info.latest && info.current !== info.latest)
      .map<OutdatedPackage>(([name, info]) => ({
        id: name,
        name,
        current: info.current ?? "?",
        latest: info.latest ?? "?",
      }));
  }

  async update(packageId: string): Promise<UpdateOutcome> {
    const [outcome] = await this.install([packageId]);
    return outcome ?? { id: packageId, success: false };
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    return this.install(packages.map((p) => p.id));
  }

  private async install(ids: readonly string[]): Promise<UpdateOutcome[]> {
    const root = await this.npmRoot();
    const res = await runInherit("npm", ["install", "-g", ...ids.map((id) => `${id}@latest`)]);
    if (!res.failed) return ids.map((id) => ({ id, success: true }));
    const outcomes: UpdateOutcome[] = [];
    for (const id of ids) {
      const fate = root === null ? null : await restoreStagedCopy(root, id);
      outcomes.push({ id, success: false, ...recoveryOf(fate) });
    }
    return outcomes;
  }

  /**
   * `npm root -g`, asked before the first install rather than after a
   * failure: an interrupted self-update can leave npm itself moved aside.
   */
  private async npmRoot(): Promise<string | null> {
    if (this.globalRoot !== null) return this.globalRoot;
    const { stdout, failed } = await run("npm", ["root", "-g"]);
    const root = stdout.trim();
    if (!failed && root !== "") this.globalRoot = root;
    return this.globalRoot;
  }
}

function recoveryOf(fate: StagedCopyFate | null): Pick<UpdateOutcome, "recovery"> {
  if (fate?.kind === "restored") return { recovery: RESTORED_NOTE };
  if (fate?.kind === "kept") return { recovery: keptNote(fate.path) };
  return {};
}
