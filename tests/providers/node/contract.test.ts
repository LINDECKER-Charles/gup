import { defineProviderContract } from "../../support/contract/define-contract.js";
import { nodeCases } from "./node.cases.js";
import { recordedNodeCases } from "./recorded.cases.js";
import { runtimeCases } from "./runtimes.cases.js";

defineProviderContract({
  domain: "node",
  cases: [...nodeCases, ...recordedNodeCases, ...runtimeCases],
});
