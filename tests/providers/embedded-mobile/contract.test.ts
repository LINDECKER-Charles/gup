import { defineProviderContract } from "../../support/contract/define-contract.js";
import { embeddedMobileCases } from "./embedded-mobile.cases.js";
import { sdksCases } from "./sdks.cases.js";

defineProviderContract({ domain: "embedded-mobile", cases: [...embeddedMobileCases, ...sdksCases] });
