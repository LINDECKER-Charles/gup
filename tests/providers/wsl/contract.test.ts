import { defineProviderContract } from "../../support/contract/define-contract.js";
import { distroCases } from "./distros.cases.js";
import { wslCases } from "./wsl.cases.js";

defineProviderContract({ domain: "wsl", cases: [...wslCases, ...distroCases] });
