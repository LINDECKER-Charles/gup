import { describe, expect, it } from "vitest";
import type { Provider } from "../../../src/core/types.js";
import { AwsCliV2Provider } from "../../../src/providers/cloud/aws-cli-v2.js";
import { RailwayProvider } from "../../../src/providers/cloud/railway.js";
import { ScwProvider } from "../../../src/providers/cloud/scw.js";
import { installedVia } from "../../support/contract/installers.js";
import { system } from "../../support/system/fake-system.js";
import type { CommandAnswer, HttpRoute } from "../../support/system/types.js";
import {
  AWS_RELEASE,
  AWS_VERSION_ARGV,
  RAILWAY_RELEASE,
  RAILWAY_VERSION_ARGV,
  SCW_RELEASE,
  SCW_VERSION_ARGV,
} from "./cloud.cases.js";

/**
 * Version banners the cloud CLIs printed over time, beside the ones their
 * contract cases use: each still yields the installed version.
 */

interface Banner {
  readonly label: string;
  readonly create: () => Provider;
  readonly binary: string;
  readonly argv: readonly string[];
  readonly answer: CommandAnswer;
  readonly release: HttpRoute;
  readonly current: string;
}

const BANNERS: readonly Banner[] = [
  {
    label: "AWS CLI v2 printing on stderr",
    create: () => new AwsCliV2Provider(),
    binary: "aws",
    argv: AWS_VERSION_ARGV,
    answer: { stderr: "aws-cli/2.15.30 Python/3.11.8 Windows/10 exe/AMD64" },
    release: AWS_RELEASE,
    current: "2.15.30",
  },
  {
    label: "Railway's former `railwayapp` name",
    create: () => new RailwayProvider(),
    binary: "railway",
    argv: RAILWAY_VERSION_ARGV,
    answer: { stdout: "railwayapp 3.5.0" },
    release: RAILWAY_RELEASE,
    current: "3.5.0",
  },
  {
    label: "Scaleway's one-line `scw version X`",
    create: () => new ScwProvider(),
    binary: "scw",
    argv: SCW_VERSION_ARGV,
    answer: { stdout: "scw version 2.30.0" },
    release: SCW_RELEASE,
    current: "2.30.0",
  },
];

describe("cloud CLI version banners", () => {
  it.each(BANNERS)("reads $label", async (banner) => {
    const probe = { argv: banner.argv, ...banner.answer };
    await system.load(installedVia("scoop", banner.binary, { commands: [probe], http: [banner.release] }));
    const rows = await banner.create().listOutdated();
    expect(rows.map((row) => row.current)).toEqual([banner.current]);
  });
});
