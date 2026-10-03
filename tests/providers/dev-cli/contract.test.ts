import { defineProviderContract } from "../../support/contract/define-contract.js";
import { devCliCases } from "./dev-cli.cases.js";

defineProviderContract({ domain: "dev-cli", cases: devCliCases });
