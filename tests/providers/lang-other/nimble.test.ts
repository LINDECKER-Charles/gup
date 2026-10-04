import { describe, expect, it } from "vitest";
import { NimbleProvider } from "../../../src/providers/lang-other/nimble.js";
import { system } from "../../support/system/fake-system.js";
import { NIM_REGISTRY_URL, nimbleMachine, nimbleReleaseRoute } from "./lang-other.cases.js";

/**
 * Nimble has no "outdated" command: each installed package is resolved to
 * its repository through the nim-lang/packages registry, and only GitHub
 * repositories get a latest release. Everything else is dropped, never
 * guessed.
 */

describe("NimbleProvider.listOutdated", () => {
  it("asks the registry nothing when no installed line parses", async () => {
    await system.load(nimbleMachine(["nothing here"], []));
    await expect(new NimbleProvider().listOutdated()).resolves.toEqual([]);
    expect(system.trace.requests).toEqual([]);
  });

  it("matches registry names case-insensitively and drops a `.git` suffix", async () => {
    const registry = [{ name: "MyPkg", url: "https://github.com/foo/mypkg.git" }];
    const release = nimbleReleaseRoute("foo/mypkg", { tag_name: "v1.2.0" });
    await system.load(nimbleMachine(["mypkg  [1.0.0]"], registry, [release]));
    await expect(new NimbleProvider().listOutdated()).resolves.toEqual([
      { id: "mypkg", name: "mypkg", current: "1.0.0", latest: "1.2.0" },
    ]);
  });

  it("asks GitHub nothing for a package the registry lacks or hosts elsewhere", async () => {
    const registry = [
      { name: "nimble" },
      { url: "https://github.com/foo/nameless" },
      { name: "elsewhere", url: "https://gitlab.com/foo/elsewhere" },
    ];
    await system.load(nimbleMachine(["unknown  [1.0.0]", "elsewhere  [1.0.0]"], registry));
    await expect(new NimbleProvider().listOutdated()).resolves.toEqual([]);
    expect(system.trace.requests.map((request) => request.url)).toEqual([NIM_REGISTRY_URL]);
  });

  it("drops a package whose latest release carries no tag", async () => {
    const registry = [{ name: "mypkg", url: "https://github.com/foo/mypkg" }];
    const release = nimbleReleaseRoute("foo/mypkg", { name: "v1.2.0" });
    await system.load(nimbleMachine(["mypkg  [1.0.0]"], registry, [release]));
    await expect(new NimbleProvider().listOutdated()).resolves.toEqual([]);
  });
});
