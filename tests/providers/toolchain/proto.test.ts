import { describe, expect, it } from "vitest";
import { ProtoProvider } from "../../../src/providers/toolchain/proto.js";
import { system } from "../../support/system/fake-system.js";
import { githubLatest } from "../../support/system/releases.js";
import { protoMachine } from "./toolchain.cases.js";

/** proto reports itself (GitHub) and its managed tools (`proto outdated --json`). */

describe("ProtoProvider.listOutdated", () => {
  it("names the entries of the array form by their position", async () => {
    const current = githubLatest("moonrepo/proto", "v0.40.4");
    await system.load(protoMachine([{ current: "20.0.0", newest: "20.5.0" }], current));
    await expect(new ProtoProvider().listOutdated()).resolves.toEqual([
      { id: "0", name: "0", current: "20.0.0", latest: "20.5.0" },
    ]);
  });
});
