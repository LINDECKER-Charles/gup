import { defineProviderContract } from "../../support/contract/define-contract.js";
import { kubernetesCases } from "./kubernetes.cases.js";
import { pluginsCases } from "./plugins.cases.js";
import { recordedKubernetesCases } from "./recorded.cases.js";

defineProviderContract({
  domain: "kubernetes",
  cases: [...kubernetesCases, ...pluginsCases, ...recordedKubernetesCases],
});
