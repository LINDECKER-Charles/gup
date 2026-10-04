import { localize } from "../../core/i18n/localized.js";
import { run } from "../../core/runner.js";

/**
 * What an upgrade broke, as pip itself sees it. `pip install --upgrade X`
 * upgrades X without asking whether the installed packages that depend on it
 * accept the new version: it prints "pip's dependency resolver does not
 * currently take into account all the packages that are installed" and exits
 * 0. Upgrading click under a semgrep that pins `click~=8.4.2`, or
 * pydantic-core under a pydantic that pins it exactly, leaves a broken
 * environment behind a reported success. `pip check` lists every requirement
 * the installed packages no longer satisfy; comparing its report before and
 * after an upgrade names the ones that upgrade broke.
 */

/** One line of `pip check`: a dependent whose requirement the installed version misses. */
export interface BrokenRequirement {
  /** "semgrep 1.178.0". */
  readonly dependent: string;
  /** "click~=8.4.2". */
  readonly requirement: string;
  /** The package as pip names it: "click", "pydantic-core". */
  readonly name: string;
  /** The version installed now. */
  readonly version: string;
}

/** `<dependent> <version> has requirement <spec>, but you have <name> <version>.` */
const BROKEN_REQUIREMENT = /^(\S+ \S+) has requirement (.+), but you have (\S+) (\S+)\.$/;
/** PEP 503: case, `-`, `_` and `.` do not tell two project names apart. */
const NAME_SEPARATORS = /[-_.]+/g;

export async function brokenRequirements(pip: string): Promise<BrokenRequirement[]> {
  // Exits 1 when something is broken: the report is on stdout either way.
  const { stdout } = await run(pip, ["check", "--disable-pip-version-check"]);
  return stdout.split(/\r?\n/).flatMap((line): BrokenRequirement[] => {
    const match = BROKEN_REQUIREMENT.exec(line.trim());
    if (!match) return [];
    const [, dependent = "", requirement = "", name = "", version = ""] = match;
    return [{ dependent, requirement, name, version }];
  });
}

/** `pip check` around an upgrade. */
export interface CheckReports {
  readonly before: readonly BrokenRequirement[];
  readonly after: readonly BrokenRequirement[];
}

/** The requirements on `packageId` broken after the upgrade that were fine before it. */
export function brokenBy(packageId: string, reports: CheckReports): BrokenRequirement[] {
  const target = canonicalName(packageId);
  const existed = (broken: BrokenRequirement): boolean =>
    reports.before.some(
      (old) =>
        old.dependent === broken.dependent &&
        old.requirement === broken.requirement &&
        canonicalName(old.name) === target,
    );
  const isOnTarget = (broken: BrokenRequirement): boolean => canonicalName(broken.name) === target;
  return reports.after.filter((broken) => isOnTarget(broken) && !existed(broken));
}

/** Why the upgrade of `packageId` did not stay, and what became of it. */
export function breakageMessage(
  packageId: string,
  broken: readonly BrokenRequirement[],
  restored: { readonly version: string | null; readonly isBack: boolean },
): string {
  const version = broken[0]?.version ?? "?";
  const dependents = broken.map((b) => `${b.dependent} (${b.requirement})`).join(", ");
  if (restored.version === null) {
    return localize({
      en: `${packageId} ${version} breaks ${dependents}`,
      fr: `${packageId} ${version} casse ${dependents}`,
    });
  }
  const previous = restored.version;
  return restored.isBack
    ? localize({
        en: `${packageId} ${version} would break ${dependents}: back to ${previous}`,
        fr: `${packageId} ${version} casserait ${dependents} : retour à ${previous}`,
      })
    : localize({
        en: `${packageId} ${version} breaks ${dependents}, and putting ${previous} back failed`,
        fr: `${packageId} ${version} casse ${dependents}, et le retour à ${previous} a échoué`,
      });
}

function canonicalName(name: string): string {
  return name.toLowerCase().replace(NAME_SEPARATORS, "-");
}
