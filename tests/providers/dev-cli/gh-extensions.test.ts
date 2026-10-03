import { describe, expect, it } from "vitest";
import { GhExtensionsProvider } from "../../../src/providers/dev-cli/gh-extensions.js";
import { system } from "../../support/system/fake-system.js";
import { probeArgvs } from "../../support/system/trace.js";
import { GH_EXTENSION_LIST, ghMachine, ghReleaseProbe } from "./dev-cli.cases.js";

/**
 * `gh extension list` has no JSON output: the provider reads its table, then
 * asks each extension's repo for its latest release through `gh api`.
 */

const HEADER = "NAME      REPO              VERSION";
const listed = () => new GhExtensionsProvider().listOutdated();

describe("GhExtensionsProvider.listOutdated", () => {
  it("lists nothing, and probes no repo, without an extension", async () => {
    await system.load(ghMachine(""));
    await expect(listed()).resolves.toEqual([]);
    expect(probeArgvs()).toEqual([GH_EXTENSION_LIST]);
  });

  it("skips the header, the dash rule and malformed lines, probing no repo", async () => {
    const listing = [
      HEADER,
      "----       ----              -------",
      "soloname",
      "gh-foo     not-a-repo-token  v1.0.0",
    ].join("\n");
    await system.load(ghMachine(listing));
    await expect(listed()).resolves.toEqual([]);
    expect(probeArgvs()).toEqual([GH_EXTENSION_LIST]);
  });

  it.each([
    ["the release lookup fails", ghReleaseProbe("owner/foo", "", 1)],
    ["the release has no tag", ghReleaseProbe("owner/foo", "   ")],
    ["the release is the installed tag without its v", ghReleaseProbe("owner/foo", "1.0.0\n")],
  ])("skips an extension when %s", async (_label, probe) => {
    await system.load(ghMachine(`${HEADER}\ngh-foo    owner/foo         v1.0.0`, [probe]));
    await expect(listed()).resolves.toEqual([]);
  });

  it("reads the active-extension marker and a missing version column", async () => {
    const listing = [HEADER, "* gh-foo  owner/foo         v1.0.0", "gh-bar    owner/bar"].join("\n");
    const probes = [ghReleaseProbe("owner/foo", "v1.2.3"), ghReleaseProbe("owner/bar", "v2.0.0")];
    await system.load(ghMachine(listing, probes));
    await expect(listed()).resolves.toEqual([
      { id: "gh-foo", name: "gh-foo", current: "v1.0.0", latest: "v1.2.3" },
      { id: "gh-bar", name: "gh-bar", current: "?", latest: "v2.0.0" },
    ]);
  });
});
