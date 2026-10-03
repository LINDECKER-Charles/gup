import { defineProviderContract } from "../../support/contract/define-contract.js";
import { jvmCases } from "./jvm.cases.js";

defineProviderContract({ domain: "jvm", cases: jvmCases });
