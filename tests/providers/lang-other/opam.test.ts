import { describe, expect, it } from "vitest";
import { OpamProvider } from "../../../src/providers/lang-other/opam.js";
import { system } from "../../support/system/fake-system.js";
import { probeArgvs } from "../../support/system/trace.js";
import { OPAM_LIST_ARGV, OPAM_UPDATE_ARGV, opamMachine } from "./lang-other.cases.js";

/** opam lists what is upgradable against its local copy of the repositories. */

describe("OpamProvider.listOutdated", () => {
  it("refreshes the repository metadata before listing", async () => {
    await system.load(opamMachine(""));
    await new OpamProvider().listOutdated();
    expect(probeArgvs()).toEqual([OPAM_UPDATE_ARGV, OPAM_LIST_ARGV]);
  });

  it("skips comments, blank, unchanged and incomplete rows", async () => {
    const stdout = [
      "# comment line",
      "",
      "dune   3.10.0    3.11.0",
      "same 1.0 1.0",
      "incomplete row",
    ].join("\n");
    await system.load(opamMachine(stdout));
    await expect(new OpamProvider().listOutdated()).resolves.toEqual([
      { id: "dune", name: "dune", current: "3.10.0", latest: "3.11.0" },
    ]);
  });
});
