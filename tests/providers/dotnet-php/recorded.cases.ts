import { DotnetSdkProvider } from "../../../src/providers/dotnet-php/dotnet-sdk.js";
import type { ProviderContractCase } from "../../support/contract/types.js";
import { fixture, golden } from "../../support/fixtures/refs.js";
import { dotnetManualMessage, RELEASES_INDEX_URL } from "./dotnet-php.cases.js";

/**
 * `dotnet --list-sdks` as recorded on Windows 11 by `npm run fixtures:record`
 * (two SDKs, CRLF lines), against a releases index one SDK ahead on the 10.0
 * channel. Its rows are a golden.
 */
const RECORDED_INDEX = {
  "releases-index": [
    {
      "channel-version": "10.0",
      "latest-release": "10.0.5",
      "latest-sdk": "10.0.402",
      "support-phase": "active",
      "release-type": "lts",
    },
    { "channel-version": "9.0", "latest-sdk": "9.0.318", "support-phase": "active", "release-type": "sts" },
  ],
};

const DOTNET_SDK_RECORDED: ProviderContractCase = {
  scenario: "recorded on windows",
  create: () => new DotnetSdkProvider(),
  system: {
    platform: "win32",
    bin: { dotnet: "C:\\Program Files\\dotnet\\dotnet.exe" },
    commands: [
      {
        argv: ["dotnet", "--list-sdks"],
        stdout: fixture("providers/dotnet-php/dotnet-sdk/list-sdks.win32.txt"),
      },
    ],
    http: [{ url: RELEASES_INDEX_URL, json: RECORDED_INDEX }],
  },
  outdated: golden("dotnet-php", "dotnet-sdk.recorded.win32"),
  update: {
    packageId: "10.0",
    installs: [],
    outcome: { success: false, skipped: true, message: dotnetManualMessage("10.0") },
  },
  updateAll: "skipped",
};

export const recordedDotnetPhpCases: readonly ProviderContractCase[] = [DOTNET_SDK_RECORDED];
