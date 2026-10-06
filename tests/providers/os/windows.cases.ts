import { ChocoProvider } from "../../../src/providers/os/choco.js";
import { CygwinProvider } from "../../../src/providers/os/cygwin.js";
import { Msys2Provider } from "../../../src/providers/os/msys2.js";
import { NpackdProvider } from "../../../src/providers/os/npackd.js";
import { ScoopProvider } from "../../../src/providers/os/scoop.js";
import { WingetProvider } from "../../../src/providers/os/winget.js";
import type { ProviderContractCase } from "../../support/contract/types.js";
import { WIN_HOME } from "../../support/system/os-identity.js";
import type { SystemSpec } from "../../support/system/types.js";

/**
 * Windows package managers. The machines and outputs a knowledge test starts
 * from are exported; the rest of the case data stays private.
 */

// --- winget -----------------------------------------------------------------

export const WINGET_UPGRADE_ARGV = [
  "winget",
  "upgrade",
  "--include-unknown",
  "--accept-source-agreements",
];
export const WINGET_PIN_ARGV = ["winget", "pin", "list"];

/** `winget upgrade` on an English Windows, the totals line included. */
const WINGET_UPGRADE_TABLE = [
  "Name                              Id                          Version       Available     Source",
  "-------------------------------------------------------------------------------------------------",
  "Microsoft Edge                    Microsoft.Edge              120.0.2210.91 121.0.2277.83 winget",
  "PowerToys                         Microsoft.PowerToys         0.75.0        0.76.0        winget",
  "Mystery App                       Mystery.App                 unknown       2.0.0         winget",
  "3 upgrades available.",
].join("\n");

/** `winget pin list`: the second column is the pinned id. */
const WINGET_PIN_LIST = [
  "Name      Id                  Version Source Pin type",
  "-----------------------------------------------------",
  "PowerToys Microsoft.PowerToys 0.75.0  winget Pinning",
].join("\n");

export const WINGET_MACHINE: SystemSpec = {
  platform: "win32",
  bin: { winget: `${WIN_HOME}\\AppData\\Local\\Microsoft\\WindowsApps\\winget.exe` },
  commands: [
    { argv: WINGET_UPGRADE_ARGV, stdout: WINGET_UPGRADE_TABLE },
    { argv: WINGET_PIN_ARGV, stdout: WINGET_PIN_LIST },
  ],
};

/** `winget upgrade --id <id>` as gup runs it, before any retry option. */
export function wingetUpgradeArgv(id: string): string[] {
  return [
    "winget",
    "upgrade",
    "--id",
    id,
    "--exact",
    "--silent",
    "--accept-package-agreements",
    "--accept-source-agreements",
    "--include-unknown",
    "--disable-interactivity",
  ];
}

const WINGET: ProviderContractCase = {
  create: () => new WingetProvider(),
  system: WINGET_MACHINE,
  outdated: [
    {
      id: "Microsoft.Edge",
      name: "Microsoft Edge",
      current: "120.0.2210.91",
      latest: "121.0.2277.83",
    },
    {
      id: "Microsoft.PowerToys",
      name: "PowerToys",
      current: "0.75.0",
      latest: "0.76.0",
      note: "pinned",
    },
    {
      id: "Mystery.App",
      name: "Mystery App",
      current: "unknown",
      latest: "2.0.0",
      note: "unknown version",
    },
  ],
  update: {
    packageId: "Microsoft.Edge",
    installs: [wingetUpgradeArgv("Microsoft.Edge")],
    // A failed upgrade is retried with --force, --uninstall-previous, then a reinstall.
    onFailure: { success: false, retryable: true },
  },
  updateAll: "per-package",
};

// --- scoop ------------------------------------------------------------------

/** `scoop status`, with a held app (Info column). */
const SCOOP_STATUS = [
  "Scoop is up to date.",
  "",
  "Name      Installed Version  Latest Version  Missing Dependencies  Info",
  "----      -----------------  --------------  --------------------  ----",
  "gh        2.40.0             2.42.1",
  "nodejs    20.10.0            20.11.1",
  "yt-dlp    2023.12.30         2024.03.10                            Held package",
  "",
].join("\n");

export const SCOOP_MACHINE: SystemSpec = {
  platform: "win32",
  bin: { scoop: `${WIN_HOME}\\scoop\\shims\\scoop.cmd` },
  commands: [{ argv: ["scoop", "status"], stdout: SCOOP_STATUS }],
};

const SCOOP: ProviderContractCase = {
  create: () => new ScoopProvider(),
  system: SCOOP_MACHINE,
  outdated: [
    { id: "gh", name: "gh", current: "2.40.0", latest: "2.42.1" },
    { id: "nodejs", name: "nodejs", current: "20.10.0", latest: "20.11.1" },
    {
      id: "yt-dlp",
      name: "yt-dlp",
      current: "2023.12.30",
      latest: "2024.03.10",
      note: "Held package",
    },
  ],
  update: { packageId: "gh", installs: [["scoop", "update", "gh"]] },
  updateAll: "one-batch",
  batchInstalls: [["scoop", "update", "*"]],
};

// --- chocolatey -------------------------------------------------------------

const CHOCO_OUTDATED_ARGV = ["choco", "outdated", "-r", "--limit-output"];

/** `choco outdated -r --limit-output`: name|current|available|pinned. */
const CHOCO_OUTDATED = "git|2.43.0|2.44.0|false\nvlc|3.0.18|3.0.20|true\n";

const CHOCO_NOT_ADMIN_MESSAGE =
  "Chocolatey nécessite un terminal admin. Relancer gup depuis PowerShell ou Terminal lancé en « Exécuter en tant qu'administrateur ».";

/** A Chocolatey install; `elevated` says whether gup runs as administrator. */
export function chocoMachine(elevated: boolean): SystemSpec {
  return {
    platform: "win32",
    bin: { choco: "C:\\ProgramData\\chocolatey\\bin\\choco.exe" },
    commands: [{ argv: CHOCO_OUTDATED_ARGV, stdout: CHOCO_OUTDATED }],
    elevated,
  };
}

const CHOCO_ROWS = [
  { id: "git", name: "git", current: "2.43.0", latest: "2.44.0" },
  { id: "vlc", name: "vlc", current: "3.0.18", latest: "3.0.20", note: "pinned" },
];

const CHOCO_AS_ADMIN: ProviderContractCase = {
  scenario: "administrator",
  create: () => new ChocoProvider(),
  system: chocoMachine(true),
  outdated: CHOCO_ROWS,
  update: { packageId: "git", installs: [["choco", "upgrade", "git", "-y"]] },
  updateAll: "one-batch",
  batchInstalls: [["choco", "upgrade", "all", "-y"]],
};

/** Not elevated: rows join the CLI's single UAC batch, direct updates are skipped. */
const CHOCO_AS_USER: ProviderContractCase = {
  scenario: "regular user",
  create: () => new ChocoProvider(),
  system: chocoMachine(false),
  outdated: CHOCO_ROWS.map((row) => ({ ...row, requiresAdmin: true })),
  update: {
    packageId: "git",
    installs: [],
    outcome: { success: false, skipped: true, message: CHOCO_NOT_ADMIN_MESSAGE },
  },
  updateAll: "skipped",
};

// --- MSYS2 ------------------------------------------------------------------

/** pacman of the default 64-bit root, run by absolute path (MSYS2 is not on PATH). */
export const PACMAN = "C:\\msys64\\usr\\bin\\pacman.exe";

/** `pacman -Qu` answering `stdout`; pacman exits 1 when nothing is pending. */
export function msys2Machine(stdout: string): SystemSpec {
  return {
    platform: "win32",
    fs: { [PACMAN]: { kind: "file", executable: true } },
    commands: [{ argv: [PACMAN, "-Qu"], stdout, exitCode: stdout.trim() === "" ? 1 : 0 }],
  };
}

export const MSYS2_BASE_NOTE = "base locale (pas de -Sy au scan)";
export const MSYS2_CORE_NOTE = `${MSYS2_BASE_NOTE} · cœur MSYS2 : relancer les shells MSYS2 après`;
export const MSYS2_SYNC_FAILED = "pacman a terminé en erreur — voir sa sortie ci-dessus.";

const MSYS2: ProviderContractCase = {
  create: () => new Msys2Provider(),
  system: msys2Machine(
    "mingw-w64-x86_64-gcc 13.3.0-1 -> 14.2.0-1\nmsys2-runtime 3.5.4-2 -> 3.5.7-2\n",
  ),
  outdated: [
    {
      id: "mingw-w64-x86_64-gcc",
      name: "mingw-w64-x86_64-gcc",
      current: "13.3.0-1",
      latest: "14.2.0-1",
      note: MSYS2_BASE_NOTE,
    },
    {
      id: "msys2-runtime",
      name: "msys2-runtime",
      current: "3.5.4-2",
      latest: "3.5.7-2",
      note: MSYS2_CORE_NOTE,
    },
  ],
  update: {
    packageId: "mingw-w64-x86_64-gcc",
    // -S on the selected targets only, never -Syu (see msys2.test.ts).
    installs: [[PACMAN, "-S", "--needed", "--noconfirm", "mingw-w64-x86_64-gcc"]],
    onFailure: { success: false, message: MSYS2_SYNC_FAILED },
  },
  updateAll: "one-batch",
  batchInstalls: [
    [PACMAN, "-S", "--needed", "--noconfirm", "mingw-w64-x86_64-gcc", "msys2-runtime"],
  ],
};

// --- Cygwin -----------------------------------------------------------------

export const CYGWIN_ROOT = "C:\\cygwin64";
export const CYGCHECK = "C:\\cygwin64\\bin\\cygcheck.exe";
export const SETUP_IN_ROOT = "C:\\cygwin64\\setup-x86_64.exe";
export const SETUP_IN_DOWNLOADS = `${WIN_HOME}\\Downloads\\setup-x86_64.exe`;

/** A Cygwin tree (cygcheck.exe is the marker) and setup wherever it was left. */
export function cygwinMachine(setup: string | null, elevated = false): SystemSpec {
  return {
    platform: "win32",
    fs: {
      [CYGCHECK]: { kind: "file", executable: true },
      ...(setup !== null && { [setup]: { kind: "file", executable: true } }),
    },
    elevated,
  };
}

const CYGWIN_UNVERIFIABLE_MESSAGE =
  "setup s'est élevé via UAC : son processus parent sort toujours en 0, le " +
  "résultat réel est dans sa fenêtre et dans setup.log. Relancer gup en " +
  "administrateur pour obtenir un statut fiable.";

const CYGWIN_MISSING_SETUP_MESSAGE =
  "setup-x86_64.exe introuvable : Cygwin ne l'installe pas dans son arborescence. " +
  "Le télécharger sur https://cygwin.com/setup-x86_64.exe puis le placer dans la " +
  "racine Cygwin ou dans le dossier Downloads du profil utilisateur.";

/** The upgrade argv setup runs for the tree at `root`. */
export function cygwinUpgradeArgv(setup: string, root: string): string[] {
  return [setup, "--quiet-mode", "--upgrade-also", "--no-shortcuts", "--wait", "--root", root];
}

const CYGWIN_ROW = {
  id: "cygwin",
  aggregate: true,
  name: "Cygwin (paquets)",
  current: "?",
  latest: "refresh",
};

/**
 * Not elevated, setup self-elevates through UAC: a zero exit proves nothing,
 * which the outcome says.
 */
const CYGWIN: ProviderContractCase = {
  create: () => new CygwinProvider(),
  system: cygwinMachine(SETUP_IN_ROOT),
  outdated: [{ ...CYGWIN_ROW, note: "setup-x86_64.exe -q -g" }],
  update: {
    packageId: "cygwin",
    installs: [cygwinUpgradeArgv(SETUP_IN_ROOT, CYGWIN_ROOT)],
    outcome: { success: true, message: CYGWIN_UNVERIFIABLE_MESSAGE },
  },
  updateAll: "collapsed",
};

/** Cygwin never installs its own setup: the update has to wait for a download. */
const CYGWIN_WITHOUT_SETUP: ProviderContractCase = {
  scenario: "setup not downloaded",
  create: () => new CygwinProvider(),
  system: cygwinMachine(null),
  outdated: [{ ...CYGWIN_ROW, note: "setup-x86_64.exe introuvable — à télécharger" }],
  update: {
    packageId: "cygwin",
    installs: [],
    outcome: { success: false, skipped: true, message: CYGWIN_MISSING_SETUP_MESSAGE },
  },
  updateAll: "skipped",
};

// --- Npackd -----------------------------------------------------------------

export const NPACKD_JSON_ARGV = ["ncl", "search", "--status", "updateable", "--json"];
export const NPACKD_BARE_ARGV = ["ncl", "search", "--status", "updateable", "--bare-format"];
export const NPACKD_NOTE = "version disponible non listée par ncl";
export const NPACKD_NOT_ADMIN_MESSAGE =
  "Npackd installe à l'échelle du système par défaut : relancer gup depuis un terminal « Exécuter en tant qu'administrateur ».";

/** `ncl search --status updateable --json`, indented as NpackdCL prints it. */
export const NPACKD_JSON = JSON.stringify(
  {
    packages: [
      {
        name: "com.googlecode.windirstat.WinDirStat",
        title: "WinDirStat",
        installed: [{ version: "1.1.2", where: "C:\\Program Files\\WinDirStat" }],
      },
      {
        name: "org.7-zip.SevenZIP64",
        title: "7-Zip 64 bit",
        installed: [{ version: "23.1", where: "C:\\Program Files\\7-Zip" }],
      },
    ],
  },
  null,
  2,
);

export const NPACKD_BIN = "C:\\Program Files\\NpackdCL\\ncl.exe";

/** NpackdCL under its short name; `elevated` says whether gup runs as administrator. */
export function npackdMachine(elevated: boolean): SystemSpec {
  return {
    platform: "win32",
    bin: { ncl: NPACKD_BIN },
    commands: [{ argv: NPACKD_JSON_ARGV, stdout: NPACKD_JSON }],
    elevated,
  };
}

const WINDIRSTAT = "com.googlecode.windirstat.WinDirStat";
const SEVEN_ZIP = "org.7-zip.SevenZIP64";

/** No Npackd command prints the newest available version: `latest` is `?`. */
const NPACKD_ROWS = [
  { id: WINDIRSTAT, name: "WinDirStat", current: "1.1.2", latest: "?", note: NPACKD_NOTE },
  { id: SEVEN_ZIP, name: "7-Zip 64 bit", current: "23.1", latest: "?", note: NPACKD_NOTE },
];

const NPACKD_AS_ADMIN: ProviderContractCase = {
  scenario: "administrator",
  create: () => new NpackdProvider(),
  system: npackdMachine(true),
  outdated: NPACKD_ROWS,
  update: {
    packageId: WINDIRSTAT,
    installs: [["ncl", "update", "--non-interactive", "--package", WINDIRSTAT]],
  },
  updateAll: "one-batch",
  // `--package` is repeatable: the selection is planned as one dependency graph.
  batchInstalls: [
    ["ncl", "update", "--non-interactive", "--package", WINDIRSTAT, "--package", SEVEN_ZIP],
  ],
};

/** Not elevated: rows join the CLI's single UAC batch, direct updates are skipped. */
const NPACKD_AS_USER: ProviderContractCase = {
  scenario: "regular user",
  create: () => new NpackdProvider(),
  system: npackdMachine(false),
  outdated: NPACKD_ROWS.map((row) => ({ ...row, requiresAdmin: true })),
  update: {
    packageId: WINDIRSTAT,
    installs: [],
    outcome: { success: false, skipped: true, message: NPACKD_NOT_ADMIN_MESSAGE },
  },
  updateAll: "skipped",
};

export const windowsCases: readonly ProviderContractCase[] = [
  WINGET,
  SCOOP,
  CHOCO_AS_ADMIN,
  CHOCO_AS_USER,
  MSYS2,
  CYGWIN,
  CYGWIN_WITHOUT_SETUP,
  NPACKD_AS_ADMIN,
  NPACKD_AS_USER,
];
