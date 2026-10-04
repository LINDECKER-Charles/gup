import { pickInstallHint } from "../../core/install-hint.js";
import { commandExists, run, runInherit } from "../../core/runner.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";
import { restoreStagedCopy, type StagedCopyFate } from "./npm-staged-copy.js";
import { localized } from "../../core/i18n/localized.js";
import { MANUAL_STEPS } from "../manual-steps.js";

interface NpmOutdatedEntry {
  current?: string;
  wanted?: string;
  latest?: string;
}

/** What npm prints instead of a report when the command itself failed. */
interface NpmErrorReport {
  code?: unknown;
  summary?: unknown;
  /** Present when `error` is a package of that name, not npm's error. */
  latest?: unknown;
}

/** What this provider tells the user, in the interface's languages. */
const TEXT = localized({
  en: {
    /** The outcome's recovery note once npm's staged copy is back in place. */
    restoredNote: "previous version restored",
    /** …and when npm had begun writing the new version: the old copy is left where npm put it. */
    keptNote: (path: string) => `old version set aside by npm in ${path}`,
    /** `code` is empty or " (<npm error code>)". */
    outdatedFailed: (code: string, summary: string) => `npm outdated failed${code}: ${summary}`,
  },
  fr: {
    restoredNote: "version précédente restaurée",
    keptNote: (path) => `ancienne version mise de côté par npm dans ${path}`,
    outdatedFailed: (code, summary) => `npm outdated a échoué${code} : ${summary}`,
  },
});

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
  get installHint(): string {
    return pickInstallHint({
      win32: MANUAL_STEPS.install("Node.js", "https://nodejs.org"),
      fallback: "brew install node",
    });
  }
  private globalRoot: string | null = null;

  async isAvailable(): Promise<boolean> {
    return commandExists("npm");
  }

  /**
   * Throws when npm reports its own failure — a registry answering 503, no
   * network — so the scan shows an error instead of "nothing outdated".
   */
  async listOutdated(): Promise<OutdatedPackage[]> {
    const { stdout } = await run("npm", [
      "outdated",
      "-g",
      "--json",
      "--long",
    ]);
    const parsed = parseReport(stdout);
    const failure = npmFailure(parsed);
    if (failure !== null) throw new Error(failure);

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

/** npm's report as an object; empty for no output, or one that is not a JSON object. */
function parseReport(stdout: string): Record<string, NpmOutdatedEntry> {
  try {
    const parsed: unknown = JSON.parse(stdout);
    const isObject = typeof parsed === "object" && parsed !== null && !Array.isArray(parsed);
    return isObject ? (parsed as Record<string, NpmOutdatedEntry>) : {};
  } catch {
    return {};
  }
}

/**
 * The scan error for npm's own failure report, `{"error": {"code", "summary",
 * "detail"}}`; null for a package report — one of whose packages may well be
 * named `error`, with versions rather than a summary.
 */
function npmFailure(report: Record<string, NpmOutdatedEntry>): string | null {
  const error = report["error"] as NpmErrorReport | undefined;
  if (typeof error?.summary !== "string" || error.latest !== undefined) return null;
  const summary = error.summary.replace(/\s+/g, " ").trim();
  const code = typeof error.code === "string" ? ` (${error.code})` : "";
  return TEXT.outdatedFailed(code, summary);
}

function recoveryOf(fate: StagedCopyFate | null): Pick<UpdateOutcome, "recovery"> {
  if (fate?.kind === "restored") return { recovery: TEXT.restoredNote };
  if (fate?.kind === "kept") return { recovery: TEXT.keptNote(fate.path) };
  return {};
}
