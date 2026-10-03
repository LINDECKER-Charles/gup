import { PipProvider } from "../../../src/providers/python/pip.js";
import type { ProviderContractCase } from "../../support/contract/types.js";
import { fixture, golden } from "../../support/fixtures/refs.js";
import { WIN_HOME } from "../../support/system/os-identity.js";
import { PIP_INSTALL_ARGS, PIP_LIST_ARGS } from "./python.cases.js";

/**
 * pip on its real `list --outdated` report, recorded on Windows 11 by
 * `npm run fixtures:record` and neutralised (package names replaced by
 * package-NN, versions and file types kept): its rows are a golden.
 */

/** The neutral names of the recorded report, in its order. */
const RECORDED_PIP_PACKAGES = Array.from(
  { length: 10 },
  (_, index) => `package-${String(index + 1).padStart(2, "0")}`,
);

const PIP_RECORDED: ProviderContractCase = {
  scenario: "recorded on windows",
  create: () => new PipProvider(),
  system: {
    platform: "win32",
    bin: { pip: `${WIN_HOME}\\AppData\\Roaming\\Python\\Python313\\Scripts\\pip.exe` },
    commands: [
      {
        argv: ["pip", ...PIP_LIST_ARGS],
        stdout: fixture("providers/python/pip/list-outdated.win32.json"),
      },
    ],
  },
  outdated: golden("python", "pip.recorded.win32"),
  update: { packageId: "package-01", installs: [["pip", ...PIP_INSTALL_ARGS, "package-01"]] },
  updateAll: "one-batch",
  batchInstalls: [["pip", ...PIP_INSTALL_ARGS, ...RECORDED_PIP_PACKAGES]],
};

export const recordedPythonCases: readonly ProviderContractCase[] = [PIP_RECORDED];
