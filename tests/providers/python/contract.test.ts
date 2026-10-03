import { defineProviderContract } from "../../support/contract/define-contract.js";
import { pythonCases } from "./python.cases.js";

defineProviderContract({ domain: "python", cases: pythonCases });
