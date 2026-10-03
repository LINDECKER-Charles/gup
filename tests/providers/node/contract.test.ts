import { defineProviderContract } from "../../support/contract/define-contract.js";
import { nodeCases } from "./node.cases.js";

defineProviderContract({ domain: "node", cases: nodeCases });
