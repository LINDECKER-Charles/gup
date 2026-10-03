import { defineProviderContract } from "../../support/contract/define-contract.js";
import { toolchainCases } from "./toolchain.cases.js";

defineProviderContract({ domain: "toolchain", cases: toolchainCases });
