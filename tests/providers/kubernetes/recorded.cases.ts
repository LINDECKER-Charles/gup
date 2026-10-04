import { KubectlProvider } from "../../../src/providers/kubernetes/kubectl.js";
import type { ProviderContractCase } from "../../support/contract/types.js";
import { fixture, golden } from "../../support/fixtures/refs.js";
import { KUBECTL_VERSION_ARGV, kubectlStable } from "./kubernetes.cases.js";

/**
 * kubectl on its real `version --client -o json`, recorded on Windows 11 by
 * `npm run fixtures:record`: the kubectl Docker Desktop ships, which no
 * package manager owns, so the row is manual and the update left to the user.
 */
const KUBECTL_RECORDED: ProviderContractCase = {
  scenario: "recorded on windows (docker desktop)",
  create: () => new KubectlProvider(),
  system: {
    platform: "win32",
    bin: { kubectl: "C:\\Program Files\\Docker\\Docker\\resources\\bin\\kubectl.exe" },
    commands: [
      {
        argv: KUBECTL_VERSION_ARGV,
        stdout: fixture("providers/kubernetes/kubectl/version-client.win32.json"),
      },
    ],
    http: [kubectlStable("v1.36.2")],
  },
  outdated: golden("kubernetes", "kubectl.recorded.win32"),
  update: {
    packageId: "kubectl",
    installs: [],
    outcome: {
      success: false,
      skipped: true,
      message: "Télécharger kubectl depuis https://kubernetes.io/releases/download/",
    },
  },
  updateAll: "skipped",
};

export const recordedKubernetesCases: readonly ProviderContractCase[] = [KUBECTL_RECORDED];
