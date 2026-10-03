import { defineProviderContract } from "../../support/contract/define-contract.js";
import { dotnetPhpCases } from "./dotnet-php.cases.js";
import { phpCases } from "./php.cases.js";

defineProviderContract({ domain: "dotnet-php", cases: [...dotnetPhpCases, ...phpCases] });
