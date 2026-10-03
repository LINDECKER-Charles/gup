import { defineProviderContract } from "../../support/contract/define-contract.js";
import { containersCases } from "./containers.cases.js";

defineProviderContract({ domain: "containers", cases: containersCases });
