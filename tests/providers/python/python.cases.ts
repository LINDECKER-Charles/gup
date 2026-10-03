import { CondaProvider } from "../../../src/providers/python/conda.js";
import { PdmProvider } from "../../../src/providers/python/pdm.js";
import { PipProvider } from "../../../src/providers/python/pip.js";
import { PipxProvider } from "../../../src/providers/python/pipx.js";
import { PoetryProvider } from "../../../src/providers/python/poetry.js";
import { PyenvProvider } from "../../../src/providers/python/pyenv.js";
import { PyenvWinProvider } from "../../../src/providers/python/pyenv-win.js";
import { RyeProvider } from "../../../src/providers/python/rye.js";
import { UvToolsProvider } from "../../../src/providers/python/uv-tools.js";
import { delegationRoutes, installedVia } from "../../support/contract/installers.js";
import {
  nothingListedOn,
  type SelfUpdatingTool,
  selfUpdatingToolCases,
} from "../../support/contract/self-updating-tool.js";
import type { ProviderContractCase } from "../../support/contract/types.js";
import { githubLatest, pypiRoute } from "../../support/system/releases.js";
import type { CommandScript, HttpRoute, SystemSpec } from "../../support/system/types.js";

/**
 * Python's package and version managers. The machines and outputs a knowledge
 * test starts from are exported; the rest of the case data stays private.
 */

// --- Conda ----------------------------------------------------------------------

/** conda itself and the whole base environment, in one update. */
const CONDA: SelfUpdatingTool = {
  create: () => new CondaProvider(),
  system: {
    platform: "win32",
    bin: { conda: "C:\\Users\\u\\miniconda3\\condabin\\conda.bat" },
    commands: [{ argv: ["conda", "--version"], stdout: "conda 24.5.0" }],
  },
  release: githubLatest("conda/conda", "24.7.0"),
  row: {
    id: "conda",
    name: "Conda (base env)",
    current: "24.5.0",
    latest: "24.7.0",
    note: "updates conda + base env",
  },
  upToDate: githubLatest("conda/conda", "24.5.0"),
  installs: [["conda", "update", "--all", "-n", "base", "-y"]],
};

// --- PDM, Poetry, Rye: self-updating Python tools ---------------------------------

const PDM: SelfUpdatingTool = {
  create: () => new PdmProvider(),
  system: {
    platform: "darwin",
    bin: { pdm: "/Users/u/.local/bin/pdm" },
    commands: [{ argv: ["pdm", "--version"], stdout: "PDM, version 2.17.1" }],
  },
  release: pypiRoute("pdm", "2.18.0"),
  row: { id: "pdm", name: "PDM", current: "2.17.1", latest: "2.18.0" },
  upToDate: pypiRoute("pdm", "2.17.1"),
  installs: [["pdm", "self", "update"]],
};

const POETRY: SelfUpdatingTool = {
  create: () => new PoetryProvider(),
  system: {
    platform: "linux",
    bin: { poetry: "/home/u/.local/bin/poetry" },
    commands: [{ argv: ["poetry", "--version", "--no-ansi"], stdout: "Poetry (version 1.8.3)" }],
  },
  release: pypiRoute("poetry", "1.8.4"),
  row: { id: "poetry", name: "Poetry", current: "1.8.3", latest: "1.8.4" },
  upToDate: pypiRoute("poetry", "1.8.3"),
  installs: [["poetry", "self", "update"]],
};

const RYE: SelfUpdatingTool = {
  create: () => new RyeProvider(),
  system: {
    platform: "linux",
    bin: { rye: "/home/u/.rye/shims/rye" },
    commands: [
      { argv: ["rye", "--version"], stdout: "rye 0.39.0\ncommit: 0.39.0 (bf3ccf818 2024-08-21)" },
    ],
  },
  release: githubLatest("astral-sh/rye", "0.40.0"),
  row: { id: "rye", name: "Rye", current: "0.39.0", latest: "0.40.0" },
  upToDate: githubLatest("astral-sh/rye", "0.39.0"),
  installs: [["rye", "self", "update"]],
};

// --- pyenv-win ------------------------------------------------------------------

/** The Windows port: its own project, its own `pyenv update`. */
const PYENV_WIN: SelfUpdatingTool = {
  create: () => new PyenvWinProvider(),
  system: {
    platform: "win32",
    bin: { pyenv: "C:\\Users\\u\\.pyenv\\pyenv-win\\bin\\pyenv.bat" },
    commands: [{ argv: ["pyenv", "--version"], stdout: "pyenv 3.1.1" }],
  },
  release: githubLatest("pyenv-win/pyenv-win", "v3.1.2"),
  row: { id: "pyenv-win", name: "pyenv-win", current: "3.1.1", latest: "3.1.2" },
  upToDate: githubLatest("pyenv-win/pyenv-win", "v3.1.1"),
  installs: [["pyenv", "update"]],
};

// --- pip (user site) ------------------------------------------------------------

const PIP_LIST_ARGS = [
  "list",
  "--outdated",
  "--user",
  "--format=json",
  "--disable-pip-version-check",
];
const PIP_INSTALL_ARGS = ["install", "--user", "--upgrade", "--disable-pip-version-check"];

const PIP_REPORT = JSON.stringify([
  { name: "requests", version: "2.30.0", latest_version: "2.32.3", latest_filetype: "wheel" },
  { name: "rich", version: "13.0.0", latest_version: "13.7.1", latest_filetype: "wheel" },
]);

const PIP_ROWS = [
  { id: "requests", name: "requests", current: "2.30.0", latest: "2.32.3" },
  { id: "rich", name: "rich", current: "13.0.0", latest: "13.7.1" },
];

/** The pip provider on `system`, where `binary` is the pip found on PATH. */
function pipCase(
  scenario: string,
  binary: "pip" | "pip3",
  system: SystemSpec,
): ProviderContractCase {
  return {
    scenario,
    create: () => new PipProvider(),
    system,
    outdated: PIP_ROWS,
    update: { packageId: "requests", installs: [[binary, ...PIP_INSTALL_ARGS, "requests"]] },
    updateAll: "one-batch",
    batchInstalls: [[binary, ...PIP_INSTALL_ARGS, "requests", "rich"]],
  };
}

const PIP = pipCase("pip", "pip", {
  platform: "win32",
  bin: { pip: "C:\\Users\\u\\AppData\\Local\\Programs\\Python\\Python312\\Scripts\\pip.exe" },
  commands: [{ argv: ["pip", ...PIP_LIST_ARGS], stdout: PIP_REPORT }],
});

/** A Linux or Homebrew Python often ships only `pip3`. */
const PIP3_ONLY = pipCase("pip3 only", "pip3", {
  platform: "linux",
  bin: { pip3: "/usr/bin/pip3" },
  commands: [{ argv: ["pip3", ...PIP_LIST_ARGS], stdout: PIP_REPORT }],
});

// --- pipx -----------------------------------------------------------------------

/** One pipx venv, as `pipx list --json` reports it. */
function pipxVenv(name: string, version: string): Record<string, unknown> {
  return {
    metadata: {
      main_package: { package: name, package_or_url: name, package_version: version },
    },
  };
}

/** pipx with `venvs` installed, PyPI answering `http`. */
export function pipxMachine(venvs: Record<string, string>, http: readonly HttpRoute[]): SystemSpec {
  const entries = Object.entries(venvs).map(([name, version]) => [name, pipxVenv(name, version)]);
  return {
    platform: "darwin",
    bin: { pipx: "/opt/homebrew/bin/pipx" },
    commands: [
      {
        argv: ["pipx", "list", "--json"],
        stdout: JSON.stringify({ pipx_spec_version: "0.1", venvs: Object.fromEntries(entries) }),
      },
    ],
    http,
  };
}

/** Three apps, one PyPI lookup each: two behind, one current. */
const PIPX: ProviderContractCase = {
  create: () => new PipxProvider(),
  system: pipxMachine({ black: "24.0.0", ruff: "0.5.0", httpie: "3.2.2" }, [
    pypiRoute("black", "24.4.0"),
    pypiRoute("ruff", "0.6.1"),
    pypiRoute("httpie", "3.2.2"),
  ]),
  outdated: [
    { id: "black", name: "black", current: "24.0.0", latest: "24.4.0" },
    { id: "ruff", name: "ruff", current: "0.5.0", latest: "0.6.1" },
  ],
  update: { packageId: "black", installs: [["pipx", "upgrade", "black"]] },
  updateAll: "one-batch",
  // `upgrade-all` upgrades every app, selected or not.
  batchInstalls: [["pipx", "upgrade-all"]],
};

// --- uv tools -------------------------------------------------------------------

export const UV_TOOL_LIST_ARGV = ["uv", "tool", "list"];

/** uv answering `listing` for `uv tool list`, PyPI answering `http`. */
export function uvMachine(
  listing: Omit<CommandScript, "argv">,
  http: readonly HttpRoute[] = [],
): SystemSpec {
  return {
    platform: "win32",
    bin: { uv: "C:\\Users\\u\\.local\\bin\\uv.exe" },
    commands: [{ argv: UV_TOOL_LIST_ARGV, ...listing }],
    http,
  };
}

/** `<tool> v<version>`, then its executables; one PyPI lookup per tool. */
const UV_TOOLS: ProviderContractCase = {
  create: () => new UvToolsProvider(),
  system: uvMachine(
    { stdout: "black v24.0.0\n- black\n- blackd\nruff v0.5.0\n- ruff\nhttpie v3.2.2\n- http\n- https" },
    [pypiRoute("black", "24.4.0"), pypiRoute("ruff", "0.6.1"), pypiRoute("httpie", "3.2.2")],
  ),
  outdated: [
    { id: "black", name: "black", current: "24.0.0", latest: "24.4.0" },
    { id: "ruff", name: "ruff", current: "0.5.0", latest: "0.6.1" },
  ],
  update: { packageId: "ruff", installs: [["uv", "tool", "upgrade", "ruff"]] },
  updateAll: "one-batch",
  batchInstalls: [["uv", "tool", "upgrade", "--all"]],
};

// --- pyenv ----------------------------------------------------------------------

export const PYENV_VERSION_ARGV = ["pyenv", "--version"];
export const PYENV_ROOT_ARGV = ["pyenv", "root"];
export const PYENV_RELEASE = githubLatest("pyenv/pyenv", "v2.9.0");
export const PYENV_MANUAL_MESSAGE =
  "Aucune mise à jour automatique pour cette installation de pyenv : mettre à jour le clone git (cd $(pyenv root) && git pull --ff-only) ou réinstaller via https://pyenv.run";

/** pyenv printing `pyenv <version>`, and `root` for `pyenv root`. */
export function pyenvAnswers(version: string, root: Omit<CommandScript, "argv">): CommandScript[] {
  return [
    { argv: PYENV_VERSION_ARGV, stdout: `pyenv ${version}` },
    { argv: PYENV_ROOT_ARGV, ...root },
  ];
}

/** `git pull --ff-only` in `root`: the whole upgrade of a clone. */
export function pullArgv(root: string): string[] {
  return ["git", "-C", root, "pull", "--ff-only"];
}

/**
 * The installer's layout: a clone in ~/.pyenv, its bin on PATH. `extra` is
 * merged in, for a knowledge test that moves the binary or the root.
 */
export function pyenvCloneMachine(version = "2.8.3", extra: Partial<SystemSpec> = {}): SystemSpec {
  return {
    platform: "linux",
    bin: { pyenv: "/home/u/.pyenv/bin/pyenv", git: "/usr/bin/git" },
    commands: pyenvAnswers(version, { stdout: "/home/u/.pyenv" }),
    fs: { "/home/u/.pyenv/.git": { kind: "dir" } },
    http: [PYENV_RELEASE],
    ...extra,
  };
}

/** pyenv from Homebrew; its data root holds no clone. */
export const PYENV_BREW_MACHINE: SystemSpec = installedVia("brew", "pyenv", {
  commands: pyenvAnswers("2.8.3", { stdout: "/Users/u/.pyenv" }),
  http: [PYENV_RELEASE],
});

const PYENV_ROW = { id: "pyenv", name: "pyenv", current: "2.8.3", latest: "2.9.0" };

/** `pyenv update` is a plugin, not a built-in: a clone is fast-forwarded with git. */
const PYENV_CLONE: ProviderContractCase = {
  scenario: "git clone",
  create: () => new PyenvProvider(),
  system: pyenvCloneMachine(),
  outdated: [{ ...PYENV_ROW, note: "clone git — git pull --ff-only" }],
  update: {
    packageId: "pyenv",
    installs: [pullArgv("/home/u/.pyenv")],
    onFailure: {
      success: false,
      message:
        "git pull --ff-only a échoué dans /home/u/.pyenv — HEAD détaché sur un tag, commits locaux ou branche divergente",
    },
  },
  updateAll: "collapsed",
};

/** Homebrew and Debian ship pyenv; nothing else can be named, so the rest is manual. */
const PYENV_HOMEBREW: ProviderContractCase = {
  scenario: "homebrew",
  create: () => new PyenvProvider(),
  system: PYENV_BREW_MACHINE,
  outdated: [{ ...PYENV_ROW, note: "via brew" }],
  update: { packageId: "pyenv", installs: [["brew", "upgrade", "--formula", "pyenv"]] },
  routes: delegationRoutes(
    "pyenv",
    { ids: { brew: "pyenv", apt: "pyenv" }, manualMessage: PYENV_MANUAL_MESSAGE },
    { commands: pyenvAnswers("2.8.3", { exitCode: 1 }) },
  ),
  updateAll: "collapsed",
};

/** A Debian package upgrades through sudo: the row joins the single elevated batch. */
const PYENV_APT: ProviderContractCase = {
  scenario: "apt package",
  create: () => new PyenvProvider(),
  system: installedVia("apt", "pyenv", {
    commands: pyenvAnswers("2.8.3", { stdout: "/home/u/.pyenv" }),
    http: [PYENV_RELEASE],
  }),
  outdated: [{ ...PYENV_ROW, note: "via apt", requiresAdmin: true }],
  update: {
    packageId: "pyenv",
    installs: [["sudo", "apt-get", "install", "--only-upgrade", "-y", "pyenv"]],
  },
  updateAll: "collapsed",
};

/** Nothing owns the binary: the row says so, and is not hidden as `manual`. */
const PYENV_UNKNOWN: ProviderContractCase = {
  scenario: "unknown install",
  create: () => new PyenvProvider(),
  system: {
    platform: "linux",
    bin: { pyenv: "/home/u/bin/pyenv" },
    commands: pyenvAnswers("2.8.3", { stdout: "/home/u/.pyenv" }),
    http: [PYENV_RELEASE],
  },
  outdated: [{ ...PYENV_ROW, note: "source inconnue — mise à jour manuelle" }],
  update: {
    packageId: "pyenv",
    installs: [],
    outcome: { success: false, skipped: true, message: PYENV_MANUAL_MESSAGE },
  },
  updateAll: "skipped",
};

/** `git describe` on a checkout past its tag: ahead, never behind. */
const PYENV_AHEAD: ProviderContractCase = {
  scenario: "checkout ahead of its tag",
  create: () => new PyenvProvider(),
  system: pyenvCloneMachine("2.9.0-12-gabc1234"),
  outdated: [],
  updateAll: "collapsed",
};

export const pythonCases: readonly ProviderContractCase[] = [
  ...[CONDA, PDM, POETRY, RYE, PYENV_WIN].flatMap(selfUpdatingToolCases),
  // A valid PyPI answer whose `info` names no version lists nothing.
  nothingListedOn(PDM, "PyPI without a version", pypiRoute("pdm")),
  nothingListedOn(POETRY, "PyPI without a version", pypiRoute("poetry")),
  PIP,
  PIP3_ONLY,
  PIPX,
  UV_TOOLS,
  PYENV_CLONE,
  PYENV_HOMEBREW,
  PYENV_APT,
  PYENV_UNKNOWN,
  PYENV_AHEAD,
];
