import { localized } from "./i18n/localized.js";
import type { OutdatedPackage, ProviderScanResult } from "./types.js";
import { PACKAGE_NAME } from "./version.js";

/**
 * gup updating gup. On Windows a running gup keeps its native modules loaded
 * — OpenTUI's renderer through `node:ffi`, node-pty's ConPTY — and Windows
 * neither deletes nor renames a loaded DLL: `npm install -g` fails half way
 * through replacing the package, and can leave it broken (the package folder
 * emptied, its command gone). So on Windows gup never updates itself: its
 * row says to quit first and gives the command to run then, and the app
 * prints that command when it exits. Elsewhere a running file can be
 * replaced, and gup updates itself like any other global npm package.
 */

/** The command that updates gup once it has exited: the README's install line, latest version. */
export const SELF_UPDATE_COMMAND = `npm install -g ${PACKAGE_NAME}@latest --allow-scripts=node-pty`;

/** What gup says of its own update, on its row, in an outcome and on exit. */
export const SELF_UPDATE_TEXT = localized({
  en: {
    /** The row's note: short enough for the Note column. */
    note: "after quitting gup",
    refused:
      "gup cannot replace itself while it runs: quit gup, then run " + SELF_UPDATE_COMMAND,
    /** Printed once gup has exited, above the commands to run. */
    afterExit: "To update gup now that it has exited, run:",
  },
  fr: {
    note: "après avoir quitté gup",
    refused:
      "gup ne peut pas se remplacer pendant qu'il tourne : quitter gup, puis lancer " +
      SELF_UPDATE_COMMAND,
    afterExit: "Pour mettre gup à jour maintenant qu'il est fermé, lancer :",
  },
});

/** Whether `packageId`, in the npm-g provider, is gup itself. */
export function isGupPackage(packageId: string): boolean {
  return packageId === PACKAGE_NAME;
}

/** Whether a running gup can replace its own files: everywhere but Windows. */
export function canReplaceItselfWhileRunning(
  platform: NodeJS.Platform = process.platform,
): boolean {
  return platform !== "win32";
}

/** Whether gup can update this row now, rather than once it has exited. */
export function isUpdatableNow(pkg: OutdatedPackage): boolean {
  return pkg.updateAfterExit === undefined;
}

/** The commands the scan's rows leave for after gup has exited, once each. */
export function commandsAfterExit(scans: readonly ProviderScanResult[]): string[] {
  const commands = scans.flatMap((scan) =>
    scan.packages.flatMap((pkg) => (isUpdatableNow(pkg) ? [] : [pkg.updateAfterExit ?? ""])),
  );
  return [...new Set(commands)];
}
