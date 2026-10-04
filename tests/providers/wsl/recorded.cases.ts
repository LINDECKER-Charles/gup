import { WslProvider } from "../../../src/providers/wsl/wsl.js";
import type { ProviderContractCase } from "../../support/contract/types.js";
import { fixture, golden } from "../../support/fixtures/refs.js";
import { githubLatest } from "../../support/system/releases.js";
import type { SystemSpec } from "../../support/system/types.js";
import { LIST_DISTROS } from "./distros.cases.js";
import { WSL_VERSION_ARGV, wslHost } from "./wsl.cases.js";

/**
 * WSL as recorded on a French Windows 11 by `npm run fixtures:record`: both
 * outputs in UTF-16 (a NUL after each character, as gup decodes them), the
 * banner localised, and only Docker Desktop's internal distribution listed.
 */
export const RECORDED_WSL_MACHINE: SystemSpec = {
  ...wslHost([
    { argv: WSL_VERSION_ARGV, stdout: fixture("providers/wsl/wsl/version.win32.txt") },
    { argv: LIST_DISTROS, stdout: fixture("providers/wsl/wsl/list-quiet.win32.txt") },
  ]),
  http: [githubLatest("microsoft/WSL", "2.7.14")],
};

/**
 * The French banner reads `Version WSL : 2.7.13.0`: the English-only regex
 * finds no version, so nothing is listed (design note, findings).
 */
const WSL_RECORDED: ProviderContractCase = {
  scenario: "recorded on windows (fr)",
  create: () => new WslProvider(),
  system: RECORDED_WSL_MACHINE,
  outdated: golden("wsl", "wsl.recorded.win32"),
  updateAll: "collapsed",
};

export const recordedWslCases: readonly ProviderContractCase[] = [WSL_RECORDED];
