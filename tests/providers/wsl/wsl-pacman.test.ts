import { describe, expect, it } from "vitest";
import { system } from "../../support/system/fake-system.js";
import { archDistro, distrosMachine, PACMAN } from "./distros.cases.js";

/** pacman-contrib's `checkupdates`: one line per package, exit 2 when there is nothing. */

describe("WslPacmanProvider.listOutdated", () => {
  it.each([
    ["an empty list (exit 0)", { stdout: "", exitCode: 0 }],
    ["nothing to update or a held lock (exit 2)", { exitCode: 2 }],
    ["an unexpected exit", { exitCode: 1 }],
  ])("lists nothing for %s", async (_label, count) => {
    await system.load(distrosMachine([archDistro("Arch", count)]));
    await expect(PACMAN.create().listOutdated()).resolves.toEqual([]);
  });
});
