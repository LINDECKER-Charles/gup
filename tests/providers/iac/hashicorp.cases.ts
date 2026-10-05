import { BoundaryProvider } from "../../../src/providers/iac/boundary.js";
import { ConsulProvider } from "../../../src/providers/iac/consul.js";
import { NomadProvider } from "../../../src/providers/iac/nomad.js";
import { PackerProvider } from "../../../src/providers/iac/packer.js";
import { TerraformProvider } from "../../../src/providers/iac/terraform.js";
import { VaultProvider } from "../../../src/providers/iac/vault.js";
import type { Provider } from "../../../src/core/types.js";
import { installedVia } from "../../support/contract/installers.js";
import {
  nothingListedCase,
  type ReleasedTool,
  releasedToolCases,
} from "../../support/contract/released-tool.js";
import type { ProviderContractCase } from "../../support/contract/types.js";
import { hashicorpLatest } from "../../support/system/releases.js";

/**
 * HashiCorp tools: the version banner of the binary against
 * api.releases.hashicorp.com, upgraded by the installer that owns the binary.
 * They left homebrew-core for the hashicorp/tap tap, whose formulae keep the
 * short name once installed.
 */

interface HashicorpTool {
  readonly create: () => Provider;
  readonly product: string;
  readonly name: string;
  readonly banner: string;
  readonly current: string;
  readonly latest: string;
  readonly wingetId: string;
}

/** Same id for scoop, choco and the tap formula; a `HashiCorp.<Name>` winget id. */
function hashicorpTool(tool: HashicorpTool, probeArgs: readonly string[]): ReleasedTool {
  const { product } = tool;
  return {
    create: tool.create,
    id: product,
    name: tool.name,
    binary: product,
    probe: { argv: [product, ...probeArgs], stdout: tool.banner },
    current: tool.current,
    release: hashicorpLatest(product, tool.latest),
    latest: tool.latest,
    // The API never prefixes a `v`; the providers strip one anyway.
    upToDate: hashicorpLatest(product, `v${tool.current}`),
    delegation: {
      ids: { scoop: product, choco: product, winget: tool.wingetId, brew: product },
      manualMessage: `Télécharger https://releases.hashicorp.com/${product}/ et remplacer ${product}.exe`,
    },
  };
}

const VAULT = hashicorpTool(
  {
    create: () => new VaultProvider(),
    product: "vault",
    name: "Vault",
    banner: "Vault v1.16.3 (6ed1d3a9f5e8b5bdfb3e3d4cb5c6e4b2b8e2a9a1), built 2024-05-29T14:28:42Z",
    current: "1.16.3",
    latest: "1.17.2",
    wingetId: "HashiCorp.Vault",
  },
  ["version"],
);

const CONSUL = hashicorpTool(
  {
    create: () => new ConsulProvider(),
    product: "consul",
    name: "Consul",
    banner: "Consul v1.18.1\nRevision 98cb473c\nBuild Date 2024-03-26T21:59:08Z",
    current: "1.18.1",
    latest: "1.19.1",
    wingetId: "HashiCorp.Consul",
  },
  ["version"],
);

const NOMAD = hashicorpTool(
  {
    create: () => new NomadProvider(),
    product: "nomad",
    name: "Nomad",
    banner: "Nomad v1.7.6\nBuildDate 2024-03-12T07:27:36Z\nRevision 594fedbfbc4f0e532b65e8a69b28ff9403eb822e",
    current: "1.7.6",
    latest: "1.8.2",
    wingetId: "HashiCorp.Nomad",
  },
  ["version"],
);

const PACKER = hashicorpTool(
  {
    create: () => new PackerProvider(),
    product: "packer",
    name: "Packer",
    banner: "Packer v1.10.3\n\nYour version of Packer is out of date! The latest version\nis 1.11.1.",
    current: "1.10.3",
    latest: "1.11.1",
    wingetId: "HashiCorp.Packer",
  },
  ["version"],
);

const BOUNDARY = hashicorpTool(
  {
    create: () => new BoundaryProvider(),
    product: "boundary",
    name: "Boundary",
    banner: [
      "",
      "Version information:",
      "  Build Date:          2024-04-23T15:38:46Z",
      "  Git Revision:        4c8d9a7a2c8a1f1e3d0b8b0f8f0f5f2c7c2f1e3d",
      "  Version Number:      0.16.0",
      "",
    ].join("\n"),
    current: "0.16.0",
    latest: "0.17.0",
    wingetId: "HashiCorp.Boundary",
  },
  ["version"],
);

const TERRAFORM: ReleasedTool = {
  ...hashicorpTool(
    {
      create: () => new TerraformProvider(),
      product: "terraform",
      name: "Terraform",
      banner: JSON.stringify({
        terraform_version: "1.5.7",
        platform: "windows_amd64",
        provider_selections: {},
        terraform_outdated: true,
      }),
      current: "1.5.7",
      latest: "1.9.5",
      wingetId: "HashiCorp.Terraform",
    },
    ["version", "-json"],
  ),
  // Terraform compares the API's version verbatim: no `v` to strip.
  upToDate: hashicorpLatest("terraform", "1.5.7"),
};

/** Builds older than the structured "Version Number:" line print a one-line banner. */
const BOUNDARY_ONE_LINE_BANNER: ProviderContractCase = {
  scenario: "one-line banner",
  create: () => new BoundaryProvider(),
  system: installedVia("brew", "boundary", {
    commands: [{ argv: ["boundary", "version"], stdout: "Boundary v0.15.4" }],
    http: [hashicorpLatest("boundary", "0.17.0")],
  }),
  outdated: [
    {
      id: "boundary",
      name: "Boundary",
      current: "0.15.4",
      latest: "0.17.0",
      note: "via brew",
      installedBy: "brew",
    },
  ],
  update: { packageId: "boundary", installs: [["brew", "upgrade", "--formula", "boundary"]] },
  updateAll: "collapsed",
};

/** Valid JSON that lacks the field Terraform reads: nothing to compare, nothing listed. */
const TERRAFORM_INCOMPLETE_ANSWERS: readonly ProviderContractCase[] = [
  nothingListedCase(TERRAFORM, "version JSON without terraform_version", {
    probe: { argv: ["terraform", "version", "-json"], stdout: '{"platform":"windows_amd64"}' },
  }),
  nothingListedCase(TERRAFORM, "release without a version", {
    release: { url: TERRAFORM.release.url, json: { name: "terraform" } },
  }),
];

export const hashicorpCases: readonly ProviderContractCase[] = [
  ...[TERRAFORM, VAULT, CONSUL, NOMAD, PACKER, BOUNDARY].flatMap(releasedToolCases),
  ...TERRAFORM_INCOMPLETE_ANSWERS,
  BOUNDARY_ONE_LINE_BANNER,
];
