import { describe, expect, it } from "vitest";
import { NpmGlobalProvider } from "../../../src/providers/node/npm-global.js";
import { system } from "../../support/system/fake-system.js";
import { npmMachine } from "./node.cases.js";

/** `npm outdated -g --json`: an object keyed by package, `{}` when nothing is behind. */

describe("NpmGlobalProvider.listOutdated", () => {
  it("lists nothing for an empty report", async () => {
    await system.load(npmMachine("{}"));
    await expect(new NpmGlobalProvider().listOutdated()).resolves.toEqual([]);
  });

  it("skips entries without both versions, or already current", async () => {
    const report = {
      "pkg-equal": { current: "1.0.0", wanted: "1.0.0", latest: "1.0.0" },
      "pkg-no-current": { latest: "1.0.0" },
      "pkg-no-latest": { current: "1.0.0" },
      "pkg-ok": { current: "1.0.0", wanted: "2.0.0", latest: "2.0.0" },
    };
    await system.load(npmMachine(JSON.stringify(report)));
    await expect(new NpmGlobalProvider().listOutdated()).resolves.toEqual([
      { id: "pkg-ok", name: "pkg-ok", current: "1.0.0", latest: "2.0.0" },
    ]);
  });
});
