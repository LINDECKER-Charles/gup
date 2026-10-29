import { commandExists, run, runInherit } from "../../core/runner.js";
import { pickInstallHint } from "../../core/install-hint.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";
import {
  breakageMessage,
  brokenBy,
  brokenRequirements,
  type CheckReports,
} from "./pip-conflicts.js";
import { PipSites } from "./pip-sites.js";

/** A package as it was before its upgrade, and the site it lives in. */
interface UpgradedPackage {
  readonly id: string;
  readonly previous: string | null;
  readonly scope: readonly string[];
}

interface PipOutdatedEntry {
  name: string;
  version: string;
  latest_version: string;
  latest_filetype?: string;
}

/**
 * Packages pip installed: in the user site, and in the interpreter's own
 * site-packages when that one is the user's to write (`pip-sites.ts`). Each
 * is upgraded in the site it lives in.
 */
export class PipProvider implements Provider {
  readonly id = "pip";
  readonly displayName = "pip";
  // macOS ships a python3 without pip and deprecates it; the usable Python is
  // the Homebrew one. Pointing a Mac user at python.org would install a third
  // interpreter next to the two already there.
  readonly installHint = pickInstallHint({
    darwin: "brew install python",
    fallback: "Python: https://www.python.org/downloads/",
  });

  async isAvailable(): Promise<boolean> {
    return (await commandExists("pip")) || (await commandExists("pip3"));
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const pip = await pipCommand();
    const sites = await PipSites.read(pip);
    const { stdout } = await run(pip, [
      "list",
      "--outdated",
      ...sites.listScope(),
      "--format=json",
      "--disable-pip-version-check",
    ]);
    return parseOutdated(stdout).filter((p) => sites.holds(p.id));
  }

  /** An upgrade that breaks a package depending on it is undone (`pip-conflicts.ts`). */
  async update(packageId: string): Promise<UpdateOutcome> {
    const pip = await pipCommand();
    const scope = (await PipSites.read(pip)).scopeOf(packageId);
    const previous = await installedVersion(pip, packageId);
    const before = await brokenRequirements(pip);
    const res = await runInherit(pip, [...upgradeArgs(scope), packageId]);
    if (res.failed) return { id: packageId, success: false };
    const reports = { before, after: await brokenRequirements(pip) };
    return keepOrRestore(pip, { id: packageId, previous, scope }, reports);
  }

  /** One `pip install` per site, so pip resolves each batch together; then the same check. */
  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    const pip = await pipCommand();
    const sites = await PipSites.read(pip);
    const before = await brokenRequirements(pip);
    const installed = new Set<OutdatedPackage>();
    for (const batch of sites.batches(packages)) {
      const ids = batch.packages.map((p) => p.id);
      const res = await runInherit(pip, [...upgradeArgs(batch.scope), ...ids]);
      if (!res.failed) batch.packages.forEach((p) => installed.add(p));
    }
    if (installed.size === 0) return packages.map((p) => ({ id: p.id, success: false }));
    const reports = { before, after: await brokenRequirements(pip) };
    const outcomes: UpdateOutcome[] = [];
    for (const p of packages) {
      const pkg: UpgradedPackage = { id: p.id, previous: p.current, scope: sites.scopeOf(p.id) };
      outcomes.push(
        installed.has(p) ? await keepOrRestore(pip, pkg, reports) : { id: p.id, success: false },
      );
    }
    return outcomes;
  }
}

const VERSION_LINE = /^Version:\s*(\S+)/m;

function installArgs(scope: readonly string[]): string[] {
  return ["install", ...scope, "--disable-pip-version-check"];
}

function upgradeArgs(scope: readonly string[]): string[] {
  return ["install", ...scope, "--upgrade", "--disable-pip-version-check"];
}

async function pipCommand(): Promise<string> {
  return (await commandExists("pip")) ? "pip" : "pip3";
}

function parseOutdated(stdout: string): OutdatedPackage[] {
  if (!stdout.trim()) return [];
  let parsed: PipOutdatedEntry[];
  try {
    parsed = JSON.parse(stdout) as PipOutdatedEntry[];
  } catch {
    return [];
  }
  return parsed.map<OutdatedPackage>((p) => ({
    id: p.name,
    name: p.name,
    current: p.version,
    latest: p.latest_version,
  }));
}

/** The version `pip show` reports, null when pip does not know the package. */
async function installedVersion(pip: string, packageId: string): Promise<string | null> {
  const { stdout, failed } = await run(pip, ["show", "--disable-pip-version-check", packageId]);
  return failed ? null : (VERSION_LINE.exec(stdout)?.[1] ?? null);
}

/**
 * The upgrade stays unless it broke a package that depends on it; then the
 * previous version goes back, in the same site, and the outcome says which
 * package and which requirement — a skip when the environment is whole
 * again, a failure when it is not.
 */
async function keepOrRestore(
  pip: string,
  pkg: UpgradedPackage,
  reports: CheckReports,
): Promise<UpdateOutcome> {
  const broken = brokenBy(pkg.id, reports);
  if (broken.length === 0) return { id: pkg.id, success: true };
  if (pkg.previous === null) {
    const message = breakageMessage(pkg.id, broken, { version: null, isBack: false });
    return { id: pkg.id, success: false, message };
  }
  const res = await runInherit(pip, [...installArgs(pkg.scope), `${pkg.id}==${pkg.previous}`]);
  const message = breakageMessage(pkg.id, broken, { version: pkg.previous, isBack: !res.failed });
  if (res.failed) return { id: pkg.id, success: false, message };
  return { id: pkg.id, success: false, skipped: true, message };
}
