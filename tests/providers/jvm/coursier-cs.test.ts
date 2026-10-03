import { describe, expect, it } from "vitest";
import { CoursierCsProvider } from "../../../src/providers/jvm/coursier-cs.js";
import { withRelease } from "../../support/contract/self-updating-tool.js";
import { system } from "../../support/system/fake-system.js";
import { COURSIER_RELEASE, coursierMachine } from "./jvm.cases.js";

/** Coursier's banner changed over the years: older launchers print the bare version. */

describe("CoursierCsProvider.listOutdated", () => {
  it("reads a bare version banner, without the Coursier prefix", async () => {
    await system.load(withRelease(coursierMachine("v2.1.10"), COURSIER_RELEASE));
    const rows = await new CoursierCsProvider().listOutdated();
    expect(rows).toMatchObject([{ current: "2.1.10", latest: "2.1.12" }]);
  });

  it("lists nothing, and asks GitHub nothing, when the banner holds no version", async () => {
    await system.load(withRelease(coursierMachine("garbage"), COURSIER_RELEASE));
    await expect(new CoursierCsProvider().listOutdated()).resolves.toEqual([]);
    expect(system.trace.requests).toEqual([]);
  });
});
