/** Patches per minor version when walking back: `10.17.0` comes after `10.16.9`. */
const LAST_PATCH = 9;

/** The release before `version` (`a.b.c`): the previous patch, or the previous minor's last. */
function previous(version: string): string {
  const [major = 0, minor = 0, patch = 0] = version.split(".").map(Number);
  if (patch > 0) return `${major}.${minor}.${patch - 1}`;
  if (minor > 0) return `${major}.${minor - 1}.${LAST_PATCH}`;
  return `${Math.max(0, major - 1)}.${LAST_PATCH}.${LAST_PATCH}`;
}

/** `version` walked back `steps` releases. */
function walkedBack(version: string, steps: number): string {
  let walked = version;
  for (let step = 0; step < steps; step++) walked = previous(walked);
  return walked;
}

/** What one update attempt went from and to. */
export interface VersionStep {
  readonly from: string;
  readonly to: string;
}

/**
 * The versions of one package's attempts, oldest first, so the history
 * ends where the machine is today: the newest success installed `installed`,
 * each earlier success the release before. An attempt that did not succeed
 * went from what was installed then to what the next success installed
 * (`next`, the scan's latest, when no success followed).
 */
export function versionSteps(
  isSuccess: readonly boolean[],
  versions: { readonly installed: string; readonly next: string },
): VersionStep[] {
  const installedAfter = (newerSuccesses: number): string =>
    newerSuccesses === 0 ? versions.next : walkedBack(versions.installed, newerSuccesses - 1);
  let newerSuccesses = 0;
  const steps: VersionStep[] = [];
  for (let index = isSuccess.length - 1; index >= 0; index--) {
    const installedThen = walkedBack(versions.installed, newerSuccesses);
    if (isSuccess[index]) {
      steps.unshift({ from: walkedBack(installedThen, 1), to: installedThen });
      newerSuccesses++;
    } else {
      steps.unshift({ from: installedThen, to: installedAfter(newerSuccesses) });
    }
  }
  return steps;
}
