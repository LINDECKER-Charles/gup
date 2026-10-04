import { defineProviderContract } from "../../support/contract/define-contract.js";
import { editorPluginsCases } from "./editor-plugins.cases.js";

defineProviderContract({ domain: "editor-plugins", cases: editorPluginsCases });
