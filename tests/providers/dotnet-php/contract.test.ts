import { defineProviderContract } from "../../support/contract/define-contract.js";
import { dotnetPhpCases } from "./dotnet-php.cases.js";

defineProviderContract({ domain: "dotnet-php", cases: dotnetPhpCases });
