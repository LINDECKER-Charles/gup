import { NpmGlobalProvider } from "../../../src/providers/node/npm-global.js";
import type { ProviderContractCase } from "../../support/contract/types.js";
import { fixture, golden } from "../../support/fixtures/refs.js";
import { npmMachine } from "./node.cases.js";

/**
 * npm on its real `outdated -g --json --long` report (npm itself behind),
 * recorded on Windows 11 by `npm run fixtures:record`; the install location
 * neutralised. Its rows are a golden.
 */
const NPM_RECORDED: ProviderContractCase = {
  scenario: "recorded on windows",
  create: () => new NpmGlobalProvider(),
  system: npmMachine(fixture("providers/node/npm-g/outdated.win32.json")),
  outdated: golden("node", "npm-g.recorded.win32"),
  update: { packageId: "npm", installs: [["npm", "install", "-g", "npm@latest"]] },
  updateAll: "one-batch",
  batchInstalls: [["npm", "install", "-g", "npm@latest"]],
};

export const recordedNodeCases: readonly ProviderContractCase[] = [NPM_RECORDED];
