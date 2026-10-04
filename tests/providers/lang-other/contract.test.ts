import { defineProviderContract } from "../../support/contract/define-contract.js";
import { langOtherCases } from "./lang-other.cases.js";
import { selfUpdatingCases } from "./self-updating.cases.js";

defineProviderContract({ domain: "lang-other", cases: [...langOtherCases, ...selfUpdatingCases] });
