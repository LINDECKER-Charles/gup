/**
 * The machine both TUI mocks show: what a scan found outdated, grouped by
 * provider as Paquets groups it, which packages are checked, and which one an
 * enabled schedule covers. The "Update" tab runs exactly the checked ones.
 *
 * Package names, versions and the detected-provider count are illustrative
 * sample data; provider names are the display names of registered providers
 * (tests/rules/scenes-truth.test.mjs).
 *
 * @typedef {object} SamplePackage
 * @property {string} name
 * @property {string} from
 * @property {string} to
 * @property {boolean} isChecked
 * @property {boolean} [isScheduled]  Covered by an enabled schedule: Paquets marks it `∞`.
 *
 * @typedef {{ provider: string, packages: readonly SamplePackage[] }} SampleGroup
 */

const pkg = (name, [from, to], isChecked, isScheduled = false) =>
  Object.freeze({ name, from, to, isChecked, isScheduled });

export const SAMPLE_MACHINE = Object.freeze({
  /** Providers the scan detected: the title bar's first fact. */
  detected: 47,
  /** Enabled schedules: Planification's sidebar badge. */
  schedules: 1,
  /** @type {readonly SampleGroup[]} */
  groups: Object.freeze([
    {
      provider: "Homebrew",
      packages: [
        pkg("ripgrep", ["14.1.0", "14.1.1"], true),
        pkg("fzf", ["0.54.0", "0.55.0"], true),
        pkg("bat", ["0.24.0", "0.25.0"], false, true),
      ],
    },
    {
      provider: "npm (global)",
      packages: [
        pkg("typescript", ["5.5.4", "5.6.2"], true),
        pkg("pnpm", ["9.6.0", "9.12.1"], false),
      ],
    },
  ]),
});
