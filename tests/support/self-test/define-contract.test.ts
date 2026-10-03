import { defineProviderContract } from "../contract/define-contract.js";
import { SELF_TEST_CASES } from "./contract-cases.js";

// The generated tests, run for real against the self-test providers: every
// shape, a golden, a symlinked Homebrew install, a scoop shell delegation and
// a waiver that is needed.
defineProviderContract({ domain: "self-test", cases: SELF_TEST_CASES });
