import { OpenTofuProvider } from "../../../src/providers/iac/opentofu.js";
import { PulumiProvider } from "../../../src/providers/iac/pulumi.js";
import { TerragruntProvider } from "../../../src/providers/iac/terragrunt.js";
import { TFLintProvider } from "../../../src/providers/iac/tflint.js";
import {
  nothingListedCase,
  type ReleasedTool,
  releasedToolCases,
} from "../../support/contract/released-tool.js";
import type { ProviderContractCase } from "../../support/contract/types.js";
import { githubLatest } from "../../support/system/releases.js";

/**
 * The infrastructure tools released on GitHub. None updates itself: the
 * upgrade goes to the installer that owns the binary.
 */

const OPENTOFU: ReleasedTool = {
  create: () => new OpenTofuProvider(),
  id: "opentofu",
  name: "OpenTofu",
  binary: "tofu",
  probe: { argv: ["tofu", "version"], stdout: "OpenTofu v1.7.2\non windows_amd64" },
  current: "1.7.2",
  release: githubLatest("opentofu/opentofu", "v1.8.0"),
  latest: "1.8.0",
  upToDate: githubLatest("opentofu/opentofu", "v1.7.2"),
  delegation: {
    // The homebrew-core formula is "opentofu"; the "tofu" cask is another program.
    ids: { scoop: "opentofu", choco: "opentofu", winget: "OpenTofu.Tofu", brew: "opentofu" },
    manualMessage:
      "Télécharger https://github.com/opentofu/opentofu/releases/latest et remplacer tofu.exe",
  },
};

const TERRAGRUNT: ReleasedTool = {
  create: () => new TerragruntProvider(),
  id: "terragrunt",
  name: "Terragrunt",
  binary: "terragrunt",
  probe: { argv: ["terragrunt", "--version"], stdout: "terragrunt version v0.58.6" },
  current: "0.58.6",
  release: githubLatest("gruntwork-io/terragrunt", "v0.66.3"),
  latest: "0.66.3",
  upToDate: githubLatest("gruntwork-io/terragrunt", "v0.58.6"),
  delegation: {
    ids: {
      scoop: "terragrunt",
      choco: "terragrunt",
      winget: "Gruntwork.Terragrunt",
      brew: "terragrunt",
    },
    manualMessage:
      "Télécharger https://github.com/gruntwork-io/terragrunt/releases et remplacer terragrunt.exe",
  },
};

const TFLINT: ReleasedTool = {
  create: () => new TFLintProvider(),
  id: "tflint",
  name: "TFLint",
  binary: "tflint",
  probe: {
    argv: ["tflint", "--version"],
    stdout: "TFLint version 0.50.3\n+ ruleset.terraform (0.5.0-bundled)",
  },
  current: "0.50.3",
  release: githubLatest("terraform-linters/tflint", "v0.53.0"),
  latest: "0.53.0",
  upToDate: githubLatest("terraform-linters/tflint", "v0.50.3"),
  delegation: {
    // No homebrew-core formula: a Homebrew install gets the manual message
    // rather than an upgrade of whatever else answers to the name.
    ids: { scoop: "tflint", choco: "tflint", winget: "TerraformLinters.tflint" },
    manualMessage:
      "Télécharger https://github.com/terraform-linters/tflint/releases et remplacer tflint.exe",
  },
};

const PULUMI: ReleasedTool = {
  create: () => new PulumiProvider(),
  id: "pulumi",
  name: "Pulumi",
  binary: "pulumi",
  probe: { argv: ["pulumi", "version"], stdout: "v3.120.0" },
  current: "3.120.0",
  release: githubLatest("pulumi/pulumi", "v3.125.0"),
  latest: "3.125.0",
  upToDate: githubLatest("pulumi/pulumi", "v3.120.0"),
  delegation: {
    ids: { scoop: "pulumi", choco: "pulumi", winget: "Pulumi.Pulumi", brew: "pulumi" },
    manualMessage:
      "Réinstaller via https://www.pulumi.com/docs/install/ (le script télécharge la dernière version).",
  },
};

export const iacCases: readonly ProviderContractCase[] = [
  ...[OPENTOFU, TERRAGRUNT, TFLINT, PULUMI].flatMap(releasedToolCases),
  // Pulumi reads the GitHub API itself: a release without a tag lists nothing.
  nothingListedCase(PULUMI, "release without a tag", {
    release: { url: PULUMI.release.url, json: { name: "v3.125.0" } },
  }),
];
