import { defineProviderContract } from "../../support/contract/define-contract.js";
import { cloudCases } from "./cloud.cases.js";
import { selfUpdatingCloudCases } from "./self-updating.cases.js";

defineProviderContract({ domain: "cloud", cases: [...cloudCases, ...selfUpdatingCloudCases] });
