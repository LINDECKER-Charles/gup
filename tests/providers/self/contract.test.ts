import { defineProviderContract } from "../../support/contract/define-contract.js";
import { selfCases } from "./self.cases.js";

defineProviderContract({ domain: "self", cases: selfCases });
