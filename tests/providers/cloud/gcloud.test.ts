import { describe, expect, it } from "vitest";
import { GcloudProvider } from "../../../src/providers/cloud/gcloud.js";
import { system } from "../../support/system/fake-system.js";
import { component, gcloudMachine } from "./self-updating.cases.js";

/** A gcloud component is a row only when gcloud says an update is available, to a new version. */

describe("GcloudProvider.listOutdated", () => {
  it.each([
    ["installed and current", component("core", "Installed", { current: "1.0.0", latest: "1.1.0" })],
    ["without a current version", component("a", "Update Available", { latest: "1.1.0" })],
    ["without a latest version", component("b", "Update Available", { current: "1.0.0" })],
    ["already at its latest", component("c", "Update Available", { current: "1.0.0", latest: "1.0.0" })],
    ["without a state", component("x", undefined, { current: "1.0.0", latest: "1.1.0" })],
  ])("skips a component %s", async (_label, entry) => {
    await system.load(gcloudMachine([entry]));
    await expect(new GcloudProvider().listOutdated()).resolves.toEqual([]);
  });
});
