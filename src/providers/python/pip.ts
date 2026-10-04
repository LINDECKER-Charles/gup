import { commandExists, run, runInherit } from "../../core/runner.js";
import { pickInstallHint } from "../../core/install-hint.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";
import {
  breakageMessage,
  brokenBy,
  brokenRequirements,
  type CheckReports,
} from "./pip-conflicts.js";

interface PipOutdatedEntry {
  name: string;
  version: string;
  latest_version: string;
  latest_filetype?: string;
}

/**
 * Global pip packages. `--user` only would miss system-installed ones,
 * but on Windows global writes typically need admin — we scope to `--user`.
 */
export class PipProvider implements Provider {
  readonly id = "pip";
  readonly displayName = "pip (user)";
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
    const bin = (await commandExists("pip")) ? "pip" : "pip3";
    const { stdout } = await run(bin, [
      "list",
      "--outdated",
      "--user",
      "--format=json",
      "--disable-pip-version-check",
    ]);
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

  /** An upgrade that breaks a package depending on it is undone (`pip-conflicts.ts`). */
  async update(packageId: string): Promise<UpdateOutcome> {
    const pip = await pipCommand();
    const previous = await installedVersion(pip, packageId);
    const before = await brokenRequirements(pip);
    const res = await runInherit(pip, [...UPGRADE_ARGS, packageId]);
    if (res.failed) return { id: packageId, success: false };
    const reports = { before, after: await brokenRequirements(pip) };
    return keepOrRestore(pip, { id: packageId, previous }, reports);
  }

  /** One `pip install`, so pip resolves the batch together; then the same check per package. */
  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    const pip = await pipCommand();
    const before = await brokenRequirements(pip);
    const res = await runInherit(pip, [...UPGRADE_ARGS, ...packages.map((p) => p.id)]);
    if (res.failed) return packages.map((p) => ({ id: p.id, success: false }));
    const reports = { before, after: await brokenRequirements(pip) };
    const outcomes: UpdateOutcome[] = [];
    for (const p of packages) {
      outcomes.push(await keepOrRestore(pip, { id: p.id, previous: p.current }, reports));
    }
    return outcomes;
  }
}

const INSTALL_ARGS = ["install", "--user", "--disable-pip-version-check"];
const UPGRADE_ARGS = ["install", "--user", "--upgrade", "--disable-pip-version-check"];
const VERSION_LINE = /^Version:\s*(\S+)/m;

async function pipCommand(): Promise<string> {
  return (await commandExists("pip")) ? "pip" : "pip3";
}

/** The version `pip show` reports, null when pip does not know the package. */
async function installedVersion(pip: string, packageId: string): Promise<string | null> {
  const { stdout, failed } = await run(pip, ["show", "--disable-pip-version-check", packageId]);
  return failed ? null : (VERSION_LINE.exec(stdout)?.[1] ?? null);
}

/**
 * The upgrade stays unless it broke a package that depends on it; then the
 * previous version goes back, and the outcome says which package and which
 * requirement — a skip when the environment is whole again, a failure when
 * it is not.
 */
async function keepOrRestore(
  pip: string,
  pkg: { readonly id: string; readonly previous: string | null },
  reports: CheckReports,
): Promise<UpdateOutcome> {
  const broken = brokenBy(pkg.id, reports);
  if (broken.length === 0) return { id: pkg.id, success: true };
  if (pkg.previous === null) {
    const message = breakageMessage(pkg.id, broken, { version: null, isBack: false });
    return { id: pkg.id, success: false, message };
  }
  const res = await runInherit(pip, [...INSTALL_ARGS, `${pkg.id}==${pkg.previous}`]);
  const message = breakageMessage(pkg.id, broken, { version: pkg.previous, isBack: !res.failed });
  if (res.failed) return { id: pkg.id, success: false, message };
  return { id: pkg.id, success: false, skipped: true, message };
}
