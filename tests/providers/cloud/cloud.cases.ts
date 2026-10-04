import { AwsCliV2Provider } from "../../../src/providers/cloud/aws-cli-v2.js";
import { DoctlProvider } from "../../../src/providers/cloud/doctl.js";
import { HcloudProvider } from "../../../src/providers/cloud/hcloud.js";
import { HerokuProvider } from "../../../src/providers/cloud/heroku.js";
import { RailwayProvider } from "../../../src/providers/cloud/railway.js";
import { ScwProvider } from "../../../src/providers/cloud/scw.js";
import { SupabaseProvider } from "../../../src/providers/cloud/supabase.js";
import { delegationRoutes, installedVia } from "../../support/contract/installers.js";
import { type ReleasedTool, releasedToolCases } from "../../support/contract/released-tool.js";
import type { ProviderContractCase } from "../../support/contract/types.js";
import { githubLatest } from "../../support/system/releases.js";

/**
 * Cloud CLIs released on GitHub whose upgrade goes to the installer that owns
 * them; Heroku's standalone install updates itself instead. The probes a
 * knowledge test starts from are exported.
 */

export const AWS_VERSION_ARGV = ["aws", "--version"];
export const AWS_RELEASE = githubLatest("aws/aws-cli", "2.16.0");

const AWS_CLI: ReleasedTool = {
  create: () => new AwsCliV2Provider(),
  id: "aws-cli-v2",
  name: "AWS CLI v2",
  binary: "aws",
  probe: {
    argv: AWS_VERSION_ARGV,
    stdout: "aws-cli/2.15.30 Python/3.11.8 Windows/10 exe/AMD64 prompt/off",
  },
  current: "2.15.30",
  // aws/aws-cli tags have no `v`.
  release: AWS_RELEASE,
  latest: "2.16.0",
  upToDate: githubLatest("aws/aws-cli", "2.15.30"),
  delegation: {
    ids: { scoop: "aws", choco: "awscli", winget: "Amazon.AWSCLI", brew: "awscli" },
    manualMessage: "Télécharger https://awscli.amazonaws.com/AWSCLIV2.msi et relancer l'installeur",
  },
};

const DOCTL: ReleasedTool = {
  create: () => new DoctlProvider(),
  id: "doctl",
  name: "doctl",
  binary: "doctl",
  // The release suffix is not part of the version.
  probe: { argv: ["doctl", "version"], stdout: "doctl version 1.110.0-release\nGit commit hash: 9c7f2a8" },
  current: "1.110.0",
  release: githubLatest("digitalocean/doctl", "v1.111.0"),
  latest: "1.111.0",
  upToDate: githubLatest("digitalocean/doctl", "v1.110.0"),
  delegation: {
    ids: { scoop: "doctl", choco: "doctl", winget: "DigitalOcean.Doctl", brew: "doctl" },
    manualMessage:
      "Télécharger https://github.com/digitalocean/doctl/releases et remplacer doctl.exe",
  },
};

const HCLOUD: ReleasedTool = {
  create: () => new HcloudProvider(),
  id: "hcloud",
  name: "Hetzner Cloud CLI",
  binary: "hcloud",
  probe: { argv: ["hcloud", "version"], stdout: "hcloud v1.45.0" },
  current: "1.45.0",
  release: githubLatest("hetznercloud/cli", "v1.48.0"),
  latest: "1.48.0",
  upToDate: githubLatest("hetznercloud/cli", "v1.45.0"),
  delegation: {
    ids: { scoop: "hcloud", brew: "hcloud" },
    manualMessage:
      "Télécharger https://github.com/hetznercloud/cli/releases et remplacer hcloud.exe",
  },
};

export const RAILWAY_VERSION_ARGV = ["railway", "--version"];
export const RAILWAY_RELEASE = githubLatest("railwayapp/cli", "v3.6.0");

const RAILWAY: ReleasedTool = {
  create: () => new RailwayProvider(),
  id: "railway",
  name: "Railway CLI",
  binary: "railway",
  probe: { argv: RAILWAY_VERSION_ARGV, stdout: "railway 3.5.0" },
  current: "3.5.0",
  release: RAILWAY_RELEASE,
  latest: "3.6.0",
  upToDate: githubLatest("railwayapp/cli", "v3.5.0"),
  delegation: {
    ids: { scoop: "railway", winget: "Railway.Railway", brew: "railway" },
    manualMessage:
      "Relancer https://railway.app/install.ps1 ou télécharger https://github.com/railwayapp/cli/releases",
  },
};

export const SCW_VERSION_ARGV = ["scw", "version"];
export const SCW_RELEASE = githubLatest("scaleway/scaleway-cli", "v2.34.0");

/** `scw version` prints a key/value table. */
const SCW: ReleasedTool = {
  create: () => new ScwProvider(),
  id: "scw",
  name: "Scaleway CLI",
  binary: "scw",
  probe: {
    argv: SCW_VERSION_ARGV,
    stdout: "Version          v2.30.0\nBuildDate        2024-05-13T12:30:00Z\nGoVersion        go1.22.3",
  },
  current: "2.30.0",
  release: SCW_RELEASE,
  latest: "2.34.0",
  upToDate: githubLatest("scaleway/scaleway-cli", "v2.30.0"),
  delegation: {
    ids: { scoop: "scw", brew: "scw" },
    manualMessage:
      "Télécharger https://github.com/scaleway/scaleway-cli/releases et remplacer scw.exe",
  },
};

const SUPABASE: ReleasedTool = {
  create: () => new SupabaseProvider(),
  id: "supabase",
  name: "Supabase CLI",
  binary: "supabase",
  probe: { argv: ["supabase", "--version"], stdout: "v1.180.4" },
  current: "1.180.4",
  release: githubLatest("supabase/cli", "v1.181.0"),
  latest: "1.181.0",
  upToDate: githubLatest("supabase/cli", "v1.180.4"),
  delegation: {
    ids: { scoop: "supabase", brew: "supabase" },
    manualMessage:
      "Télécharger https://github.com/supabase/cli/releases ou `npm i -g supabase`",
  },
};

// --- Heroku: the standalone install updates itself -----------------------------------

const HEROKU_IDS = {
  scoop: "heroku-cli",
  choco: "heroku-cli",
  winget: "Heroku.HerokuCLI",
  brew: "heroku",
};
const HEROKU_PROBE = {
  argv: ["heroku", "--version"],
  stdout: "heroku/8.7.1 win32-x64 node-v16.19.0",
};
const HEROKU_MACHINE = { commands: [HEROKU_PROBE], http: [githubLatest("heroku/cli", "v8.8.0")] };
const HEROKU_ROW = { id: "heroku", name: "Heroku CLI", current: "8.7.1", latest: "8.8.0" };

/** An installer owns heroku: the upgrade goes to it, on every installer that maps an id. */
const HEROKU: ProviderContractCase = {
  scenario: "scoop",
  create: () => new HerokuProvider(),
  system: installedVia("scoop", "heroku", HEROKU_MACHINE),
  outdated: [{ ...HEROKU_ROW, note: "via scoop" }],
  update: { packageId: "heroku", installs: [["scoop", "update", "heroku-cli"]] },
  routes: delegationRoutes("heroku", {
    ids: HEROKU_IDS,
    manualMessage: "Réinstaller depuis https://devcenter.heroku.com/articles/heroku-cli",
  }).filter((route) => route.via !== "manual"),
  updateAll: "collapsed",
};

/** The standalone installer's heroku: `heroku update`, and the row is never flagged manual. */
const HEROKU_STANDALONE: ProviderContractCase = {
  scenario: "standalone",
  create: () => new HerokuProvider(),
  system: installedVia("manual", "heroku", HEROKU_MACHINE),
  outdated: [{ ...HEROKU_ROW, note: "manuel" }],
  update: { packageId: "heroku", installs: [["heroku", "update"]] },
  updateAll: "collapsed",
};

const HEROKU_UP_TO_DATE: ProviderContractCase = {
  scenario: "up to date",
  create: () => new HerokuProvider(),
  system: installedVia("scoop", "heroku", {
    commands: [HEROKU_PROBE],
    http: [githubLatest("heroku/cli", "v8.7.1")],
  }),
  outdated: [],
  updateAll: "collapsed",
};

export const cloudCases: readonly ProviderContractCase[] = [
  ...[AWS_CLI, DOCTL, HCLOUD, RAILWAY, SCW, SUPABASE].flatMap(releasedToolCases),
  HEROKU,
  HEROKU_STANDALONE,
  HEROKU_UP_TO_DATE,
];
