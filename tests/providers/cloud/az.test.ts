import { describe, expect, it } from "vitest";
import { AzProvider } from "../../../src/providers/cloud/az.js";
import { system } from "../../support/system/fake-system.js";
import { pypiRoute } from "../../support/system/releases.js";
import { azMachine } from "./self-updating.cases.js";

describe("AzProvider.listOutdated", () => {
  it("lists nothing, and asks PyPI nothing, when the JSON names no azure-cli version", async () => {
    await system.load({ ...azMachine({}), http: [pypiRoute("azure-cli", "2.55.0")] });
    await expect(new AzProvider().listOutdated()).resolves.toEqual([]);
    expect(system.trace.requests).toEqual([]);
  });
});
