import { defineProviderContract } from "../../support/contract/define-contract.js";
import { pythonCases } from "./python.cases.js";
import { recordedPythonCases } from "./recorded.cases.js";

defineProviderContract({ domain: "python", cases: [...pythonCases, ...recordedPythonCases] });
