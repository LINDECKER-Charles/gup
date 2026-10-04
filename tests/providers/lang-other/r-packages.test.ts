import { describe, expect, it } from "vitest";
import { RPackagesProvider } from "../../../src/providers/lang-other/r-packages.js";
import { system } from "../../support/system/fake-system.js";
import { rMachine } from "./lang-other.cases.js";

/**
 * R packages of the user library. The package id is spliced into R code, so
 * only a CRAN-shaped name ever reaches `Rscript`
 * (tests/security/providers/package-id-allowlists.test.ts).
 */

describe("RPackagesProvider.listOutdated", () => {
  it("skips blank, unchanged and malformed rows", async () => {
    const stdout = ["ggplot2\t3.4.0\t3.5.0", "same\t1.0\t1.0", "  ", "broken"].join("\n");
    await system.load(rMachine(stdout));
    await expect(new RPackagesProvider().listOutdated()).resolves.toEqual([
      { id: "ggplot2", name: "ggplot2", current: "3.4.0", latest: "3.5.0" },
    ]);
  });
});
