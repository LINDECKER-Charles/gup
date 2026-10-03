import { defineProviderContract } from "../../support/contract/define-contract.js";
import { securityCases } from "./security.cases.js";

defineProviderContract({ domain: "security", cases: securityCases });
