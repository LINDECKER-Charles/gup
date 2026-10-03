import { defineProviderContract } from "../../support/contract/define-contract.js";
import { devCliCases } from "./dev-cli.cases.js";
import { gitForWindowsCases } from "./git-for-windows.cases.js";
import { recordedDevCliCases } from "./recorded.cases.js";

defineProviderContract({
  domain: "dev-cli",
  cases: [...devCliCases, ...gitForWindowsCases, ...recordedDevCliCases],
});
