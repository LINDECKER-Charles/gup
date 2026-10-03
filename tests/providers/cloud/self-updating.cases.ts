import type { Provider } from "../../../src/core/types.js";
import { AzProvider } from "../../../src/providers/cloud/az.js";
import { FlyctlProvider } from "../../../src/providers/cloud/flyctl.js";
import { GcloudProvider } from "../../../src/providers/cloud/gcloud.js";
import { LinodeCliProvider } from "../../../src/providers/cloud/linode-cli.js";
import { OciCliProvider } from "../../../src/providers/cloud/oci-cli.js";
import { installedVia } from "../../support/contract/installers.js";
import {
  nothingListedOn,
  type SelfUpdatingTool,
  selfUpdatingToolCases,
  withRelease,
} from "../../support/contract/self-updating-tool.js";
import type { ProviderContractCase } from "../../support/contract/types.js";
import { WIN_HOME } from "../../support/system/os-identity.js";
import { githubLatest, pypiRoute } from "../../support/system/releases.js";
import type { CommandScript, SystemSpec } from "../../support/system/types.js";

/**
 * Cloud CLIs that update themselves or through pip: the Azure CLI (`az
 * upgrade`, versioned on PyPI), flyctl (`fly version upgrade`), the gcloud
 * components, and the Linode and Oracle Cloud CLIs (pip --user, or Homebrew
 * when it owns them). The machines a knowledge test starts from are exported.
 */

/** `scenario` prefixed to every case's own scenario. */
function named(cases: readonly ProviderContractCase[], scenario: string): ProviderContractCase[] {
  return cases.map((entry) => ({
    ...entry,
    scenario: entry.scenario ? `${scenario}, ${entry.scenario}` : scenario,
  }));
}

// --- Azure CLI ------------------------------------------------------------------------

export const AZ_VERSION_ARGV = ["az", "version", "-o", "json"];

/** `az` on PATH printing `json` for `az version -o json`. */
export function azMachine(json: unknown): SystemSpec {
  return {
    platform: "win32",
    bin: { az: "C:\\Program Files\\Microsoft SDKs\\Azure\\CLI2\\wbin\\az.cmd" },
    commands: [{ argv: AZ_VERSION_ARGV, stdout: JSON.stringify(json, null, 2) }],
  };
}

const AZ: SelfUpdatingTool = {
  create: () => new AzProvider(),
  system: azMachine({
    "azure-cli": "2.50.0",
    "azure-cli-core": "2.50.0",
    "azure-cli-telemetry": "1.1.0",
    extensions: {},
  }),
  release: pypiRoute("azure-cli", "2.55.0"),
  row: { id: "az", name: "Azure CLI", current: "2.50.0", latest: "2.55.0" },
  upToDate: pypiRoute("azure-cli", "2.50.0"),
  installs: [["az", "upgrade", "--yes"]],
};

// --- flyctl ---------------------------------------------------------------------------

const FLY_BANNER = "fly v0.2.45 windows/amd64 Commit: 4d24d7d BuildDate: 2024-04-26T13:09:51Z";
const FLY_RELEASE = githubLatest("superfly/flyctl", "v0.3.0");

/** flyctl installed under `binary` (`fly`, or the older `flyctl` alone). */
function flyTool(binary: "fly" | "flyctl"): SelfUpdatingTool {
  return {
    create: () => new FlyctlProvider(),
    system: {
      platform: "win32",
      bin: { [binary]: `${WIN_HOME}\\.fly\\bin\\${binary}.exe` },
      commands: [{ argv: [binary, "version"], stdout: FLY_BANNER }],
    },
    release: FLY_RELEASE,
    row: { id: "flyctl", name: "Fly.io CLI", current: "0.2.45", latest: "0.3.0" },
    upToDate: githubLatest("superfly/flyctl", "v0.2.45"),
    installs: [[binary, "version", "upgrade"]],
  };
}

const [FLYCTL_ONLY] = named(selfUpdatingToolCases(flyTool("flyctl")), "flyctl binary");

// --- gcloud ---------------------------------------------------------------------------

export const GCLOUD_COMPONENTS = ["gcloud", "components", "list", "--format=json", "--quiet"];
export const GCLOUD_UPDATE = ["gcloud", "components", "update", "--quiet"];

/** gcloud on PATH listing `components`. */
export function gcloudMachine(components: readonly unknown[]): SystemSpec {
  return {
    platform: "linux",
    bin: { gcloud: "/usr/lib/google-cloud-sdk/bin/gcloud" },
    commands: [{ argv: GCLOUD_COMPONENTS, stdout: JSON.stringify(components) }],
  };
}

/** One component as `gcloud components list --format=json` describes it. */
export function component(
  id: string,
  state: string | undefined,
  versions: { current?: string; latest?: string },
): Record<string, unknown> {
  return {
    id,
    ...(state !== undefined && { state: { name: state } }),
    ...(versions.current !== undefined && { current_version_string: versions.current }),
    ...(versions.latest !== undefined && { latest_version_string: versions.latest }),
  };
}

/** Only the "Update Available" components are rows; one `components update` upgrades them all. */
const GCLOUD: ProviderContractCase = {
  create: () => new GcloudProvider(),
  system: gcloudMachine([
    { ...component("kubectl", "Update Available", { current: "1.28.0", latest: "1.29.0" }), name: "kubectl" },
    // No name: the id stands in. The state is matched whatever its case.
    component("bq", "update available", { current: "2.0.95", latest: "2.0.99" }),
    component("core", "Installed", { current: "480.0.0", latest: "480.0.0" }),
  ]),
  outdated: [
    { id: "kubectl", name: "kubectl", current: "1.28.0", latest: "1.29.0", aggregate: true },
    { id: "bq", name: "bq", current: "2.0.95", latest: "2.0.99", aggregate: true },
  ],
  // update() answers for "gcloud" whatever row it is handed (design note, findings).
  update: {
    packageId: "kubectl",
    installs: [GCLOUD_UPDATE],
    outcome: { id: "gcloud" },
    onFailure: { id: "gcloud" },
  },
  updateAll: "one-batch",
  batchInstalls: [GCLOUD_UPDATE],
  waivers: [
    {
      invariant: "outcome-id",
      reason: "update(row.id) reports the id `gcloud`, not the component it was handed",
    },
  ],
};

// --- Linode and Oracle Cloud CLIs: pip, or Homebrew ----------------------------------

/** The pip upgrade of `pkg` into the user site, through `launcher`. */
export function pipUpgradeArgv(launcher: readonly string[], pkg: string): string[] {
  return [...launcher, "install", "--user", "--upgrade", "--disable-pip-version-check", pkg];
}

export interface PipCli {
  readonly create: () => Provider;
  readonly id: string;
  readonly name: string;
  /** The binary the CLI installs, and its version probe. */
  readonly binary: string;
  readonly probe: CommandScript;
  readonly current: string;
  readonly latest: string;
}

/** Where pip --user puts a script on Windows: nobody's package. */
const USER_SCRIPTS = `${WIN_HOME}\\AppData\\Roaming\\Python\\Python312\\Scripts`;

/** The CLI from pip --user, with `launchers` (python, py, pip, pip3) on PATH. */
export function pipCliMachine(cli: PipCli, launchers: readonly string[] = ["python"]): SystemSpec {
  const bin = Object.fromEntries(
    launchers.map((launcher) => [launcher, `C:\\Python312\\${launcher}.exe`]),
  );
  return {
    platform: "win32",
    bin: { ...bin, [cli.binary]: `${USER_SCRIPTS}\\${cli.binary}.exe` },
    commands: [cli.probe],
    http: [pypiRoute(cli.id, cli.latest)],
  };
}

export const LINODE_CLI: PipCli = {
  create: () => new LinodeCliProvider(),
  id: "linode-cli",
  name: "Linode CLI",
  binary: "linode-cli",
  probe: {
    argv: ["linode-cli", "--version"],
    stdout: "linode-cli 5.50.0\nBuilt from spec version 4.176.0\nThe API version is 4.176.0",
  },
  current: "5.50.0",
  latest: "5.55.0",
};

export const OCI_CLI: PipCli = {
  create: () => new OciCliProvider(),
  id: "oci-cli",
  name: "Oracle Cloud CLI",
  binary: "oci",
  probe: { argv: ["oci", "--version"], stdout: "3.40.2" },
  current: "3.40.2",
  latest: "3.41.0",
};

/**
 * pip --user on Windows (python first), and the same CLI owned by Homebrew,
 * whose virtualenv pip may not touch (PEP 668): brew takes the upgrade.
 */
function pipCliCases(cli: PipCli): ProviderContractCase[] {
  const row = { id: cli.id, name: cli.name, current: cli.current, latest: cli.latest };
  const tool: SelfUpdatingTool = {
    create: cli.create,
    system: pipCliMachine(cli),
    release: pypiRoute(cli.id, cli.latest),
    row,
    upToDate: pypiRoute(cli.id, cli.current),
    installs: [pipUpgradeArgv(["python", "-m", "pip"], cli.id)],
  };
  const pipTool = { ...tool, system: { ...tool.system, http: [] } };
  const pip = [
    ...selfUpdatingToolCases(pipTool),
    nothingListedOn(pipTool, "PyPI without a version", pypiRoute(cli.id)),
  ];
  const homebrew: ProviderContractCase = {
    scenario: "homebrew",
    create: cli.create,
    system: withRelease(installedVia("brew", cli.binary, { commands: [cli.probe] }), tool.release),
    outdated: [row],
    update: { packageId: cli.id, installs: [["brew", "upgrade", "--formula", cli.id]] },
    updateAll: "collapsed",
  };
  return [...pip, homebrew];
}

export const selfUpdatingCloudCases: readonly ProviderContractCase[] = [
  ...selfUpdatingToolCases(AZ),
  nothingListedOn(AZ, "PyPI without a version", pypiRoute("azure-cli")),
  ...selfUpdatingToolCases(flyTool("fly")),
  ...(FLYCTL_ONLY ? [FLYCTL_ONLY] : []),
  GCLOUD,
  ...pipCliCases(LINODE_CLI),
  ...pipCliCases(OCI_CLI),
];
