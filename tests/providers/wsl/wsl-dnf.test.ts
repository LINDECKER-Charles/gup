import { describe, expect, it } from "vitest";
import { system } from "../../support/system/fake-system.js";
import { distrosMachine, DNF, managedDistro } from "./distros.cases.js";

/**
 * `dnf check-update` answers with its exit code: 0 nothing to do, 100 updates
 * available (one line per package), anything else an error.
 */

const listed = () => DNF.create().listOutdated();

describe("WslDnfProvider.listOutdated", () => {
  it.each([
    ["nothing to update (exit 0)", { stdout: "", exitCode: 0 }],
    ["an error (exit 1)", { stdout: "err", exitCode: 1 }],
  ])("lists nothing for %s", async (_label, count) => {
    await system.load(distrosMachine([managedDistro(DNF, "Fedora", count)]));
    await expect(listed()).resolves.toEqual([]);
  });

  it("offers a refresh when updates exist but no package line can be counted", async () => {
    const count = { stdout: "Last metadata expiration check: now\n", exitCode: 100 };
    await system.load(distrosMachine([managedDistro(DNF, "Fedora", count)]));
    await expect(listed()).resolves.toEqual([
      { id: "Fedora", name: "Fedora (dnf)", current: "?", latest: "refresh" },
    ]);
  });
});
