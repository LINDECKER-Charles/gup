import { defineProviderContract } from "../../support/contract/define-contract.js";
import { jetbrainsCases } from "./jetbrains.cases.js";
import { visualStudioCases } from "./visual-studio.cases.js";
import { vscodeLikeCases } from "./vscode-like.cases.js";

defineProviderContract({
  domain: "ide",
  cases: [...vscodeLikeCases, ...jetbrainsCases, ...visualStudioCases],
});
