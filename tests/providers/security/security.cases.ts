import { CosignProvider } from "../../../src/providers/security/cosign.js";
import { GitsignProvider } from "../../../src/providers/security/gitsign.js";
import { GrypeProvider } from "../../../src/providers/security/grype.js";
import { NucleiProvider } from "../../../src/providers/security/nuclei.js";
import { NucleiTemplatesProvider } from "../../../src/providers/security/nuclei-templates.js";
import { PdtmProvider } from "../../../src/providers/security/pdtm.js";
import { RekorProvider } from "../../../src/providers/security/rekor.js";
import { SemgrepProvider } from "../../../src/providers/security/semgrep.js";
import { SyftProvider } from "../../../src/providers/security/syft.js";
import { TrivyProvider } from "../../../src/providers/security/trivy.js";
import { type ReleasedTool, releasedToolCases } from "../../support/contract/released-tool.js";
import {
  nothingListedOn,
  type SelfUpdatingTool,
  selfUpdatingToolCases,
} from "../../support/contract/self-updating-tool.js";
import type { ProviderContractCase } from "../../support/contract/types.js";
import { WIN_HOME } from "../../support/system/os-identity.js";
import { githubLatest, pypiRoute } from "../../support/system/releases.js";
import type { CommandAnswer, SystemSpec } from "../../support/system/types.js";

/**
 * Supply-chain and security scanners. The Sigstore and Anchore CLIs and Trivy
 * are released on GitHub and upgraded by the installer that owns them;
 * ProjectDiscovery's tools update themselves; Semgrep is a Python package,
 * upgraded with the pip of the Python it was installed into. The machines a
 * knowledge test starts from are exported.
 */

// --- released, delegated --------------------------------------------------------

/** Sigstore's `version` banner. */
const sigstoreBanner = (version: string) =>
  `GitVersion:    v${version}\nGitCommit:     abc1234\nGitTreeState:  clean`;

/** Anchore's `version` banner. */
const anchoreBanner = (tool: string, version: string) =>
  `Application:         ${tool}\nVersion:             ${version}\nBuildDate:           2024-06-01`;

const COSIGN: ReleasedTool = {
  create: () => new CosignProvider(),
  id: "cosign",
  name: "Cosign",
  binary: "cosign",
  probe: { argv: ["cosign", "version"], stdout: sigstoreBanner("2.2.4") },
  current: "2.2.4",
  release: githubLatest("sigstore/cosign", "v2.4.1"),
  latest: "2.4.1",
  upToDate: githubLatest("sigstore/cosign", "v2.2.4"),
  delegation: {
    ids: { scoop: "cosign", choco: "cosign", winget: "sigstore.cosign", brew: "cosign" },
    manualMessage: "Télécharger https://github.com/sigstore/cosign/releases et remplacer cosign.exe",
  },
};

export const GITSIGN_VERSION_ARGV = ["gitsign", "version"];
export const GITSIGN_RELEASE = githubLatest("sigstore/gitsign", "v0.13.0");

const GITSIGN: ReleasedTool = {
  create: () => new GitsignProvider(),
  id: "gitsign",
  name: "gitsign",
  binary: "gitsign",
  probe: { argv: GITSIGN_VERSION_ARGV, stdout: sigstoreBanner("0.12.0") },
  current: "0.12.0",
  release: GITSIGN_RELEASE,
  latest: "0.13.0",
  upToDate: githubLatest("sigstore/gitsign", "v0.12.0"),
  delegation: {
    ids: { scoop: "gitsign", brew: "gitsign" },
    manualMessage:
      "Télécharger https://github.com/sigstore/gitsign/releases et remplacer gitsign.exe",
  },
};

const REKOR: ReleasedTool = {
  create: () => new RekorProvider(),
  id: "rekor",
  name: "Rekor CLI",
  binary: "rekor-cli",
  probe: { argv: ["rekor-cli", "version"], stdout: sigstoreBanner("1.3.6") },
  current: "1.3.6",
  release: githubLatest("sigstore/rekor", "v1.3.7"),
  latest: "1.3.7",
  upToDate: githubLatest("sigstore/rekor", "v1.3.6"),
  delegation: {
    ids: { scoop: "rekor-cli", brew: "rekor-cli" },
    manualMessage:
      "Télécharger https://github.com/sigstore/rekor/releases et remplacer rekor-cli.exe",
  },
};

const GRYPE: ReleasedTool = {
  create: () => new GrypeProvider(),
  id: "grype",
  name: "Grype",
  binary: "grype",
  probe: { argv: ["grype", "version"], stdout: anchoreBanner("grype", "0.79.3") },
  current: "0.79.3",
  release: githubLatest("anchore/grype", "v0.82.0"),
  latest: "0.82.0",
  upToDate: githubLatest("anchore/grype", "v0.79.3"),
  delegation: {
    ids: { scoop: "grype", choco: "grype", winget: "Anchore.Grype", brew: "grype" },
    manualMessage: "Télécharger https://github.com/anchore/grype/releases et remplacer grype.exe",
  },
};

const SYFT: ReleasedTool = {
  create: () => new SyftProvider(),
  id: "syft",
  name: "Syft",
  binary: "syft",
  probe: { argv: ["syft", "version"], stdout: anchoreBanner("syft", "1.8.0") },
  current: "1.8.0",
  release: githubLatest("anchore/syft", "v1.14.0"),
  latest: "1.14.0",
  upToDate: githubLatest("anchore/syft", "v1.8.0"),
  delegation: {
    ids: { scoop: "syft", choco: "syft", winget: "Anchore.Syft", brew: "syft" },
    manualMessage: "Télécharger https://github.com/anchore/syft/releases et remplacer syft.exe",
  },
};

const TRIVY: ReleasedTool = {
  create: () => new TrivyProvider(),
  id: "trivy",
  name: "Trivy",
  binary: "trivy",
  // The database lines carry their own `Version:`: the first one is Trivy's.
  probe: {
    argv: ["trivy", "--version"],
    stdout: "Version: 0.52.2\nVulnerability DB:\n  Version: 2\n  UpdatedAt: 2024-06-01",
  },
  current: "0.52.2",
  release: githubLatest("aquasecurity/trivy", "v0.56.1"),
  latest: "0.56.1",
  upToDate: githubLatest("aquasecurity/trivy", "v0.52.2"),
  delegation: {
    ids: { scoop: "trivy", choco: "trivy", winget: "AquaSecurity.Trivy", brew: "trivy" },
    manualMessage: "Télécharger https://github.com/aquasecurity/trivy/releases et remplacer trivy.exe",
  },
};

// --- ProjectDiscovery: self-updating ----------------------------------------

export const NUCLEI_VERSION_ARGV = ["nuclei", "-version"];
export const NUCLEI_RELEASE = githubLatest("projectdiscovery/nuclei", "v3.3.0");
const NUCLEI_BINARY = `${WIN_HOME}\\go\\bin\\nuclei.exe`;

/** nuclei on PATH answering `-version` with `answer` (its banner goes to stderr). */
export function nucleiMachine(answer: CommandAnswer): SystemSpec {
  return {
    platform: "win32",
    bin: { nuclei: NUCLEI_BINARY },
    commands: [{ argv: NUCLEI_VERSION_ARGV, ...answer }],
  };
}

const NUCLEI: SelfUpdatingTool = {
  create: () => new NucleiProvider(),
  system: nucleiMachine({ stderr: "[INF] Nuclei Engine Version: v3.2.9\n" }),
  release: NUCLEI_RELEASE,
  row: { id: "nuclei", name: "Nuclei", current: "3.2.9", latest: "3.3.0" },
  upToDate: githubLatest("projectdiscovery/nuclei", "v3.2.9"),
  installs: [["nuclei", "-update"]],
};

export const TEMPLATES_RELEASE = githubLatest("projectdiscovery/nuclei-templates", "v9.9.0");

const NUCLEI_TEMPLATES: SelfUpdatingTool = {
  create: () => new NucleiTemplatesProvider(),
  system: nucleiMachine({
    stdout: "[INF] Nuclei Engine Version: v3.2.9\n",
    stderr: "[INF] Nuclei Templates Version: v9.8.0\n",
  }),
  release: TEMPLATES_RELEASE,
  row: { id: "nuclei-templates", name: "Nuclei templates", current: "9.8.0", latest: "9.9.0" },
  upToDate: githubLatest("projectdiscovery/nuclei-templates", "v9.8.0"),
  installs: [["nuclei", "-update-templates"]],
};

export const PDTM_SELF_UPDATE = ["pdtm", "-up"];
export const PDTM_UPDATE_ALL = ["pdtm", "-ua"];

export function pdtmMachine(answer: CommandAnswer): SystemSpec {
  return {
    platform: "linux",
    bin: { pdtm: "/home/u/go/bin/pdtm" },
    commands: [{ argv: ["pdtm", "-version"], ...answer }],
  };
}

/** pdtm upgrades itself, then every tool it manages. */
const PDTM: SelfUpdatingTool = {
  create: () => new PdtmProvider(),
  system: pdtmMachine({ stderr: "[INF] Current Version: v0.0.9\n" }),
  release: githubLatest("projectdiscovery/pdtm", "v0.1.0"),
  row: { id: "pdtm", name: "pdtm", current: "0.0.9", latest: "0.1.0" },
  upToDate: githubLatest("projectdiscovery/pdtm", "v0.0.9"),
  installs: [PDTM_SELF_UPDATE, PDTM_UPDATE_ALL],
};

// --- Semgrep: pip of its own Python ---------------------------------------------

const WINDOWS_PYTHON = `${WIN_HOME}\\AppData\\Local\\Programs\\Python\\Python312`;
export const SEMGREP_PATHS = {
  windows: { semgrep: `${WINDOWS_PYTHON}\\Scripts\\semgrep.exe`, python: `${WINDOWS_PYTHON}\\python.exe` },
  linux: { semgrep: "/home/u/.venvs/tools/bin/semgrep", python: "/home/u/.venvs/tools/bin/python3" },
} as const;

export function pipUpgradeArgv(python: string): string[] {
  return [python, "-m", "pip", "install", "--upgrade", "--disable-pip-version-check", "semgrep"];
}

export interface SemgrepMachine {
  readonly platform: "win32" | "linux";
  readonly semgrep: string;
  /** The interpreter beside semgrep, when there is one. */
  readonly python?: string;
}

/** semgrep on PATH printing 1.79.0, inside a Python install. */
export function semgrepMachine(machine: SemgrepMachine): SystemSpec {
  const python = machine.python;
  return {
    platform: machine.platform,
    bin: { semgrep: machine.semgrep },
    fs: python ? { [python]: { kind: "file", executable: true } } : {},
    commands: [{ argv: ["semgrep", "--version"], stdout: "1.79.0\n" }],
  };
}

function semgrepTool(machine: SemgrepMachine, python: string): SelfUpdatingTool {
  return {
    create: () => new SemgrepProvider(),
    system: semgrepMachine(machine),
    release: pypiRoute("semgrep", "1.80.0"),
    row: { id: "semgrep", name: "Semgrep", current: "1.79.0", latest: "1.80.0" },
    upToDate: pypiRoute("semgrep", "1.79.0"),
    installs: [pipUpgradeArgv(python)],
  };
}

/** Windows: the interpreter sits one level above Scripts\. */
const SEMGREP_WINDOWS = semgrepTool({ platform: "win32", ...SEMGREP_PATHS.windows }, SEMGREP_PATHS.windows.python);
/** A virtualenv: the interpreter sits beside semgrep in bin/. */
const SEMGREP_VENV = semgrepTool({ platform: "linux", ...SEMGREP_PATHS.linux }, SEMGREP_PATHS.linux.python);

/**
 * pdtm's update is two installs whatever the scan found: the up-to-date
 * scenario declares it too, so its `updateAll` is held to both.
 */
const PDTM_CASES = selfUpdatingToolCases(PDTM).map(
  (entry): ProviderContractCase =>
    entry.update ? entry : { ...entry, update: { packageId: "pdtm", installs: PDTM.installs } },
);

function scenario(entry: ProviderContractCase, name: string): ProviderContractCase {
  return { ...entry, scenario: entry.scenario ? `${name}, ${entry.scenario}` : name };
}

export const securityCases: readonly ProviderContractCase[] = [
  ...[COSIGN, GITSIGN, REKOR, GRYPE, SYFT, TRIVY].flatMap(releasedToolCases),
  ...[NUCLEI, NUCLEI_TEMPLATES].flatMap(selfUpdatingToolCases),
  ...PDTM_CASES,
  ...selfUpdatingToolCases(SEMGREP_WINDOWS).map((entry) => scenario(entry, "windows")),
  ...selfUpdatingToolCases(SEMGREP_VENV).map((entry) => scenario(entry, "virtualenv")),
  // A valid PyPI answer that names no version.
  nothingListedOn(SEMGREP_WINDOWS, "PyPI without a version", pypiRoute("semgrep")),
];
