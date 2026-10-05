import semver from "semver";
import { localized } from "./i18n/localized.js";
import { SELF_UPDATE_COMMAND } from "./self-update.js";

/**
 * The oldest Node gup runs on: 26.9.0, the first release with `node:ffi` on
 * by default (nodejs/node#65475), through which OpenTUI loads its native
 * renderer. Below it the interactive app cannot load, and the program, built
 * for `node26` and typed against `@types/node` 26, is not meant to run.
 *
 * `cli.ts` checks it before the program loads, and stops on an older Node
 * with where to get a newer one; the tests' global setup holds the suites to
 * it. The tsup target and `@types/node` follow its major
 * (tests/core/node-floor.test.ts).
 */
export const MIN_NODE = "26.9.0";

/** nodejs.org's download page, in the reader's language: installers and package managers, per OS. */
const DOWNLOAD_PAGE = {
  en: "https://nodejs.org/en/download",
  fr: "https://nodejs.org/fr/download",
} as const;

/** Whether gup runs on Node `version` (`process.versions.node`: "26.9.0", no `v`). */
export function isSupportedNode(version: string): boolean {
  return semver.gte(version, MIN_NODE);
}

/**
 * What gup prints when it stops on an older Node, after the error prefix.
 * Reinstalling covers the version managers that keep global packages per
 * Node version, and a node-pty the older Node's install skipped.
 */
export const NODE_FLOOR_TEXT = localized({
  en: {
    refusal: (current: string) =>
      `gup needs Node.js ${MIN_NODE} or newer — current version ${current}\n` +
      `Install a newer Node.js: ${DOWNLOAD_PAGE.en}\n` +
      `Then reinstall gup: ${SELF_UPDATE_COMMAND}`,
  },
  fr: {
    refusal: (current) =>
      `gup nécessite Node.js ${MIN_NODE} ou plus récent — version actuelle ${current}\n` +
      `Installer une version plus récente de Node.js : ${DOWNLOAD_PAGE.fr}\n` +
      `Puis réinstaller gup : ${SELF_UPDATE_COMMAND}`,
  },
});
