import { describe, expect, it } from "vitest";
import { KrewProvider } from "../../../src/providers/kubernetes/krew.js";
import { system } from "../../support/system/fake-system.js";
import { krewMachine, krewManifest } from "./plugins.cases.js";

/**
 * krew's plugins: `kubectl krew list` (a PLUGIN/VERSION table), each one
 * versioned against its manifest in the krew index.
 */

const listed = () => new KrewProvider().listOutdated();

describe("KrewProvider.isAvailable", () => {
  it("is unavailable when kubectl has no krew", async () => {
    const noKrew = { stderr: 'error: unknown command "krew" for "kubectl"', exitCode: 1 };
    await system.load(krewMachine({ list: { stdout: "" }, krew: noKrew }));
    await expect(new KrewProvider().isAvailable()).resolves.toBe(false);
  });
});

describe("KrewProvider.listOutdated", () => {
  it.each([
    ["no table", "unrelated text"],
    ["a header without rows", "PLUGIN    VERSION\n\n"],
    ["a row without a version", "PLUGIN    VERSION\nonlyname\n"],
  ])("lists nothing, and asks the index nothing, for %s", async (_label, stdout) => {
    await system.load(krewMachine({ list: { stdout } }));
    await expect(listed()).resolves.toEqual([]);
    expect(system.trace.requests).toEqual([]);
  });

  it("drops a plugin whose manifest has no version", async () => {
    const manifests = [krewManifest("foo", "description: nothing here\n")];
    await system.load(krewMachine({ list: { stdout: "PLUGIN  VERSION\nfoo  v1.0.0\n" }, manifests }));
    await expect(listed()).resolves.toEqual([]);
  });
});
