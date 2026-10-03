import { defineProviderContract } from "../../support/contract/define-contract.js";
import { kubernetesCases } from "./kubernetes.cases.js";
import { pluginsCases } from "./plugins.cases.js";

defineProviderContract({ domain: "kubernetes", cases: [...kubernetesCases, ...pluginsCases] });
