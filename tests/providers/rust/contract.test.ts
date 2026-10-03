import { defineProviderContract } from "../../support/contract/define-contract.js";
import { rustCases } from "./rust.cases.js";

defineProviderContract({ domain: "rust", cases: rustCases });
