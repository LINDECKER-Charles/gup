import { describe, expect, it } from "vitest";
import { PipxProvider } from "../../../src/providers/python/pipx.js";
import { system } from "../../support/system/fake-system.js";
import { pypiRoute } from "../../support/system/releases.js";
import { pipxMachine } from "./python.cases.js";

/** pipx has no "outdated" command: each app's version is compared with PyPI's. */

describe("PipxProvider.listOutdated", () => {
  it("drops an app whose PyPI answer names no version", async () => {
    await system.load(pipxMachine({ black: "24.0.0" }, [pypiRoute("black")]));
    await expect(new PipxProvider().listOutdated()).resolves.toEqual([]);
  });
});
