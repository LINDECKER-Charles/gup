import { afterEach, beforeEach, vi } from "vitest";
import { defineProviderContract } from "../../support/contract/define-contract.js";
import { psResourceCases } from "./psresource.cases.js";
import { shellCases } from "./shell.cases.js";

// Nerd Fonts prints each download and install on the terminal: keep it out of the test output.
beforeEach(() => {
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

defineProviderContract({ domain: "shell", cases: [...shellCases, ...psResourceCases] });
