import AdmZip from "adm-zip";
import type { OutdatedPackage } from "../../../src/core/types.js";
import { NerdFontsProvider } from "../../../src/providers/shell/nerd-fonts.js";
import { OhMyPoshProvider } from "../../../src/providers/shell/oh-my-posh.js";
import { PwshModulesProvider } from "../../../src/providers/shell/pwsh-modules.js";
import { StarshipProvider } from "../../../src/providers/shell/starship.js";
import { type ReleasedTool, releasedToolCases } from "../../support/contract/released-tool.js";
import {
  type SelfUpdatingTool,
  selfUpdatingToolCases,
} from "../../support/contract/self-updating-tool.js";
import type { ProviderContractCase } from "../../support/contract/types.js";
import { WIN_HOME } from "../../support/system/os-identity.js";
import { githubLatest } from "../../support/system/releases.js";
import type { FsNode, HttpRoute, SystemSpec } from "../../support/system/types.js";

/**
 * Shells and prompts: Oh My Posh (updates itself), Starship (delegated to its
 * installer), PowerShell Gallery modules (pwsh, or Windows PowerShell), and
 * the Nerd Fonts families installed for the current Windows user. The
 * machines and outputs a knowledge test starts from are exported.
 */

// --- prompts --------------------------------------------------------------------

const OH_MY_POSH: SelfUpdatingTool = {
  create: () => new OhMyPoshProvider(),
  system: {
    platform: "win32",
    bin: { "oh-my-posh": `${WIN_HOME}\\AppData\\Local\\Programs\\oh-my-posh\\bin\\oh-my-posh.exe` },
    // The bare version, sometimes with a `v`.
    commands: [{ argv: ["oh-my-posh", "--version"], stdout: "v23.6.0\n" }],
  },
  release: githubLatest("JanDeDobbeleer/oh-my-posh", "v23.7.0"),
  row: { id: "oh-my-posh", name: "Oh My Posh", current: "23.6.0", latest: "23.7.0" },
  upToDate: githubLatest("JanDeDobbeleer/oh-my-posh", "v23.6.0"),
  installs: [["oh-my-posh", "upgrade"]],
};

const STARSHIP: ReleasedTool = {
  create: () => new StarshipProvider(),
  id: "starship",
  name: "Starship",
  binary: "starship",
  probe: {
    argv: ["starship", "--version"],
    stdout: "starship 1.21.1\nbranch:\ncommit_hash:\nbuild_time:2024-11-07 07:20:47 +00:00",
  },
  current: "1.21.1",
  release: githubLatest("starship/starship", "v1.22.0"),
  latest: "1.22.0",
  upToDate: githubLatest("starship/starship", "v1.21.1"),
  delegation: {
    ids: { scoop: "starship", choco: "starship", winget: "Starship.Starship", brew: "starship" },
    manualMessage:
      "Télécharger https://github.com/starship/starship/releases ou `cargo install starship --locked`",
  },
};

// --- PowerShell Gallery modules ------------------------------------------------

/** The scan pwsh-modules hands PowerShell, verbatim: the argv pins what reaches the shell. */
const PWSH_SCAN_SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
$installed = Get-InstalledModule
$results = foreach ($m in $installed) {
  $latest = Find-Module -Name $m.Name -ErrorAction SilentlyContinue
  if ($latest -and $latest.Version -gt $m.Version) {
    [pscustomobject]@{
      Name = $m.Name
      CurrentVersion = "$($m.Version)"
      LatestVersion = "$($latest.Version)"
    }
  }
}
$results | ConvertTo-Json -Compress -Depth 3
`;

const PWSH_PREFIX = ["-NoProfile", "-NonInteractive", "-Command"];

export type PowerShell = "pwsh" | "powershell";

const SHELL_PATH: Readonly<Record<PowerShell, string>> = {
  pwsh: "C:\\Program Files\\PowerShell\\7\\pwsh.exe",
  powershell: "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
};

/** Only `shell` on PATH, its module scan printing `stdout`. */
export function powerShellMachine(shell: PowerShell, stdout: string): SystemSpec {
  return {
    platform: "win32",
    bin: { [shell]: SHELL_PATH[shell] },
    commands: [{ argv: [shell, ...PWSH_PREFIX, PWSH_SCAN_SCRIPT], stdout }],
  };
}

export function updateModuleArgv(shell: PowerShell, quotedName: string): string[] {
  return [shell, ...PWSH_PREFIX, `Update-Module -Name '${quotedName}' -Force -AcceptLicense`];
}

const moduleRow = (name: string, current: string, latest: string): OutdatedPackage => ({
  id: name,
  name,
  current,
  latest,
});

/** PowerShell 7: ConvertTo-Json prints an array for several modules. */
const PWSH_MODULES: ProviderContractCase = {
  scenario: "pwsh",
  create: () => new PwshModulesProvider(),
  system: powerShellMachine(
    "pwsh",
    JSON.stringify([
      { Name: "Pester", CurrentVersion: "5.4.0", LatestVersion: "5.5.0" },
      { Name: "PSReadLine", CurrentVersion: "2.2.6", LatestVersion: "2.3.0" },
    ]),
  ),
  outdated: [moduleRow("Pester", "5.4.0", "5.5.0"), moduleRow("PSReadLine", "2.2.6", "2.3.0")],
  update: { packageId: "Pester", installs: [updateModuleArgv("pwsh", "Pester")] },
  updateAll: "per-package",
};

/** Windows PowerShell only; one module, which ConvertTo-Json prints as a bare object. */
const WINDOWS_POWERSHELL_MODULES: ProviderContractCase = {
  scenario: "windows powershell",
  create: () => new PwshModulesProvider(),
  system: powerShellMachine(
    "powershell",
    JSON.stringify({ Name: "Az", CurrentVersion: "11.0.0", LatestVersion: "11.1.0" }),
  ),
  outdated: [moduleRow("Az", "11.0.0", "11.1.0")],
  update: { packageId: "Az", installs: [updateModuleArgv("powershell", "Az")] },
  updateAll: "per-package",
};

// --- Nerd Fonts -----------------------------------------------------------------

const LOCAL = `${WIN_HOME}\\AppData\\Local`;
export const USER_FONTS_DIR = `${LOCAL}\\Microsoft\\Windows\\Fonts`;
export const NERD_FONTS_LOCKFILE = `${LOCAL}\\gup\\nerd-fonts.json`;
export const NERD_FONTS_TAG = "v3.4.0";
/** Nerd Fonts tags keep their `v`: the lockfile pins them as GitHub spells them. */
export const NERD_FONTS_RELEASE = githubLatest("ryanoasis/nerd-fonts", NERD_FONTS_TAG);

/** A zip holding `entries` (name → content; a name ending in `/` is a directory). */
export function zipOf(entries: Readonly<Record<string, string>>): Uint8Array<ArrayBuffer> {
  const zip = new AdmZip();
  for (const [name, content] of Object.entries(entries)) zip.addFile(name, Buffer.from(content));
  return new Uint8Array(zip.toBuffer());
}

/** The release asset of `family`, holding `entries`. */
export function familyZip(family: string, entries: Readonly<Record<string, string>>): HttpRoute {
  const base = "https://github.com/ryanoasis/nerd-fonts/releases/download";
  return { url: `${base}/${NERD_FONTS_TAG}/${family}.zip`, bytes: zipOf(entries) };
}

export interface FontsMachine {
  /** Files in the user's font directory. */
  readonly fonts?: readonly string[];
  /** The lockfile's content (an object is written as JSON), absent when undefined. */
  readonly lock?: unknown;
  readonly http?: readonly HttpRoute[];
}

/** A Windows user with `fonts` installed and gup's lockfile holding `lock`. */
export function fontsMachine(machine: FontsMachine): SystemSpec {
  const fonts = (machine.fonts ?? []).map((name): [string, FsNode] => [
    `${USER_FONTS_DIR}\\${name}`,
    { kind: "file", content: "font" },
  ]);
  const lockText = typeof machine.lock === "string" ? machine.lock : JSON.stringify(machine.lock);
  const lock: Record<string, FsNode> =
    machine.lock === undefined ? {} : { [NERD_FONTS_LOCKFILE]: { kind: "file", content: lockText } };
  return {
    platform: "win32",
    fs: { ...Object.fromEntries(fonts), ...lock },
    http: machine.http ?? [NERD_FONTS_RELEASE],
  };
}

const HKCU_KEY = "HKCU:\\Software\\Microsoft\\Windows NT\\CurrentVersion";

/** The PowerShell call that registers one TrueType font file for the current user. */
export function hkcuRegistration(fileName: string): string[] {
  const valueName = `${fileName.replace(/\.ttf$/i, "")} (TrueType)`;
  const script =
    `$ErrorActionPreference = 'Stop'; ` +
    `if (-not (Test-Path '${HKCU_KEY}\\Fonts')) { ` +
    `New-Item -Path '${HKCU_KEY}' -Name 'Fonts' -Force | Out-Null }; ` +
    `New-ItemProperty -Path '${HKCU_KEY}\\Fonts' -Name '${valueName}' ` +
    `-PropertyType String -Value '${USER_FONTS_DIR}\\${fileName}' -Force | Out-Null`;
  return ["powershell.exe", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script];
}

export const HKCU_REGISTRATION_FAILED =
  "Copie OK mais enregistrement HKCU échoué — relancer un shell, ou re-exécuter.";

/**
 * FiraCode installed by hand (no pin), Meslo pinned one release behind: both
 * listed, each reinstalled from its release zip and pinned again.
 */
const NERD_FONTS: ProviderContractCase = {
  create: () => new NerdFontsProvider(),
  system: fontsMachine({
    fonts: ["FiraCodeNerdFont-Regular.ttf"],
    lock: { Meslo: "v3.3.0" },
    http: [
      NERD_FONTS_RELEASE,
      familyZip("FiraCode", { "FiraCodeNerdFont-Regular.ttf": "ttf", "README.md": "readme" }),
      familyZip("Meslo", { "MesloLGSNerdFont-Regular.ttf": "ttf" }),
    ],
  }),
  outdated: [
    {
      id: "FiraCode",
      name: "Nerd Font — FiraCode",
      current: "?",
      latest: NERD_FONTS_TAG,
      note: "non suivi par gup — réinstaller pour pinner",
    },
    { id: "Meslo", name: "Nerd Font — Meslo", current: "v3.3.0", latest: NERD_FONTS_TAG },
  ],
  update: {
    packageId: "FiraCode",
    installs: [hkcuRegistration("FiraCodeNerdFont-Regular.ttf")],
    onFailure: { message: HKCU_REGISTRATION_FAILED },
  },
  updateAll: "per-package",
};

export const shellCases: readonly ProviderContractCase[] = [
  ...selfUpdatingToolCases(OH_MY_POSH),
  ...releasedToolCases(STARSHIP),
  PWSH_MODULES,
  WINDOWS_POWERSHELL_MODULES,
  NERD_FONTS,
];
