import { defineProviderContract } from "../../support/contract/define-contract.js";
import { posixCases } from "./posix.cases.js";
import { windowsCases } from "./windows.cases.js";

defineProviderContract({ domain: "os", cases: [...windowsCases, ...posixCases] });
