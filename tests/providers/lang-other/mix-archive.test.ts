import { describe, expect, it } from "vitest";
import { MixArchiveProvider } from "../../../src/providers/lang-other/mix-archive.js";
import { system } from "../../support/system/fake-system.js";
import { hexPackageRoute, mixArchiveMachine } from "./lang-other.cases.js";

/** Mix archives: `mix archive` lists `* <name>-<version>`, hex.pm knows each latest. */

describe("MixArchiveProvider", () => {
  it("stays hidden when mix is there but cannot list its archives", async () => {
    await system.load(mixArchiveMachine({ exitCode: 1, stderr: "** (Mix) Could not start" }));
    await expect(new MixArchiveProvider().isAvailable()).resolves.toBe(false);
  });

  it("asks hex.pm nothing when no line names an archive", async () => {
    await system.load(mixArchiveMachine({ stdout: "No archives currently installed." }));
    await expect(new MixArchiveProvider().listOutdated()).resolves.toEqual([]);
    expect(system.trace.requests).toEqual([]);
  });

  it("drops an archive hex.pm has no entry for, keeping the others", async () => {
    const machine = mixArchiveMachine({ stdout: "* hex-2.0.0\n* local_tool-0.1.0" }, [
      hexPackageRoute("hex", { latest_stable_version: "2.0.6" }),
      { url: "https://hex.pm/api/packages/local_tool", status: 404, json: {} },
    ]);
    await system.load(machine);
    await expect(new MixArchiveProvider().listOutdated()).resolves.toEqual([
      { id: "hex", name: "hex", current: "2.0.0", latest: "2.0.6" },
    ]);
  });
});
