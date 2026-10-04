import { describe, expect, it } from "vitest";
import { GitsignProvider } from "../../../src/providers/security/gitsign.js";
import { installedVia } from "../../support/contract/installers.js";
import { system } from "../../support/system/fake-system.js";
import { GITSIGN_RELEASE, GITSIGN_VERSION_ARGV } from "./security.cases.js";

/** Older gitsign builds print `gitsign version vX` instead of Sigstore's `GitVersion:` table. */

describe("GitsignProvider.listOutdated", () => {
  it("falls back to a `version vX` line", async () => {
    const stdout = "gitsign version v0.12.0\nBuild: 2024-01-01";
    await system.load(
      installedVia("manual", "gitsign", {
        commands: [{ argv: GITSIGN_VERSION_ARGV, stdout }],
        http: [GITSIGN_RELEASE],
      }),
    );
    await expect(new GitsignProvider().listOutdated()).resolves.toMatchObject([
      { current: "0.12.0", latest: "0.13.0", manual: true },
    ]);
  });
});
