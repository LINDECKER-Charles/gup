import {
  downloadSizes,
  npmOutput,
  pipxOutput,
  wingetOutput,
  type WingetDownload,
} from "./canned-output.js";
import type { ScriptedInstall } from "./scripted-run.js";

/** Where winget downloads each installer from (the manifests' URLs). */
const GIT: WingetDownload = {
  name: "Git",
  id: "Git.Git",
  version: "2.52.0",
  url:
    "https://github.com/git-for-windows/git/releases/download/v2.52.0.windows.1/" +
    "Git-2.52.0-64-bit.exe",
  received: 68.2,
  total: 68.2,
};
const POWERTOYS: WingetDownload = {
  name: "PowerToys",
  id: "Microsoft.PowerToys",
  version: "0.95.0",
  url:
    "https://github.com/microsoft/PowerToys/releases/download/v0.95.0/" +
    "PowerToysUserSetup-0.95.0-x64.exe",
  received: 196,
  total: 196,
};
const SEVEN_ZIP: WingetDownload = {
  name: "7-Zip",
  id: "7zip.7zip",
  version: "25.01",
  url: "https://www.7-zip.org/a/7z2501-x64.exe",
  received: 1.6,
  total: 1.6,
};
/** PowerToys halfway through its download when the run is held. */
const POWERTOYS_RECEIVED_MB = 118;
const POWERTOYS_HALFWAY: WingetDownload = { ...POWERTOYS, received: POWERTOYS_RECEIVED_MB };

/** The last thing the held run's pane shows: how far PowerToys' download got. */
export const POWERTOYS_PROGRESS = downloadSizes(POWERTOYS_HALFWAY);

/** What runs before PowerToys in both scripts: npm, pipx, then Git through winget. */
const BEFORE_POWERTOYS: readonly ScriptedInstall[] = [
  { key: "npm-g:typescript", output: npmOutput(4), ms: 4_300 },
  { key: "pipx:ruff", output: pipxOutput("ruff", "0.13.0", "0.13.2"), ms: 2_700 },
  { key: "winget:Git.Git", output: wingetOutput(GIT, "installed"), ms: 18_400 },
];
const AFTER_POWERTOYS: readonly ScriptedInstall[] = [
  { key: "winget:7zip.7zip", output: wingetOutput(SEVEN_ZIP, "installed"), ms: 6_100 },
  // The elevated batch: one UAC prompt, the install in its own window.
  { key: "choco:nodejs-lts", ms: 52_000 },
];

/**
 * The run of the six packages the update scenes check: held while
 * PowerToys downloads, 41 s into its install.
 */
export const RUN_IN_FLIGHT: readonly ScriptedInstall[] = [
  ...BEFORE_POWERTOYS,
  {
    key: "winget:Microsoft.PowerToys",
    output: wingetOutput(POWERTOYS_HALFWAY, "downloading"),
    ms: 41_000,
    holds: true,
  },
  ...AFTER_POWERTOYS,
];

/** The same run to its end: PowerToys' installer fails its hash check, the rest succeeds. */
export const RUN_TO_THE_END: readonly ScriptedInstall[] = [
  ...BEFORE_POWERTOYS,
  {
    key: "winget:Microsoft.PowerToys",
    output: wingetOutput(POWERTOYS, "hash-mismatch"),
    ms: 63_500,
    fails: true,
  },
  ...AFTER_POWERTOYS,
];
