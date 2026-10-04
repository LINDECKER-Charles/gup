import { defineProviderContract } from "../../support/contract/define-contract.js";
import { hashicorpCases } from "./hashicorp.cases.js";
import { iacCases } from "./iac.cases.js";

defineProviderContract({ domain: "iac", cases: [...iacCases, ...hashicorpCases] });
