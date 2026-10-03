import { describe, expect, it } from "vitest";
import { ArduinoCliProvider } from "../../../src/providers/embedded-mobile/arduino-cli.js";
import { system } from "../../support/system/fake-system.js";
import { installArgvs } from "../../support/system/trace.js";
import { arduinoMachine, arduinoVersion } from "./sdks.cases.js";

/**
 * arduino-cli's three sources of rows — the CLI against its releases, the
 * cores and the libraries from `outdated` — each fail on their own, and an
 * update is routed by its id's prefix.
 */

const provider = () => new ArduinoCliProvider();
const failing = { exitCode: 1 };

describe("ArduinoCliProvider.listOutdated", () => {
  it.each([
    ["fails", failing],
    ["is not JSON", { stdout: "not json" }],
    ["names no version", { stdout: JSON.stringify({}) }],
  ])("asks GitHub nothing when `version` %s", async (_label, version) => {
    await system.load(arduinoMachine({ version, outdated: failing }));
    await expect(provider().listOutdated()).resolves.toEqual([]);
    expect(system.trace.requests).toEqual([]);
  });

  it("lists no CLI row when the latest release is the installed version", async () => {
    await system.load(arduinoMachine({ version: arduinoVersion("0.35.0"), outdated: failing }));
    await expect(provider().listOutdated()).resolves.toEqual([]);
  });

  it.each([
    ["is not JSON", { stdout: "not json" }],
    ["prints nothing but blanks", { stdout: "   \n  " }],
  ])("lists no core or library when `outdated` %s", async (_label, outdated) => {
    await system.load(arduinoMachine({ version: failing, outdated }));
    await expect(provider().listOutdated()).resolves.toEqual([]);
  });

  it("skips incomplete core and library entries", async () => {
    const outdated = {
      stdout: JSON.stringify({
        Platforms: [
          { Installed: "1.0.0", Latest: "1.1.0" },
          { ID: "missing-installed", Latest: "1.1.0" },
          { ID: "missing-latest", Installed: "1.0.0" },
        ],
        Libraries: [
          { Library: { Name: "OnlyName" }, Release: { Version: "1.0.0" } },
          { Library: { Name: "NoRelease", Version: "1.0.0" } },
          { Release: { Version: "1.0.0" } },
        ],
      }),
    };
    await system.load(arduinoMachine({ version: arduinoVersion("0.35.0"), outdated }));
    await expect(provider().listOutdated()).resolves.toEqual([]);
  });
});

describe("ArduinoCliProvider.update", () => {
  it.each([
    ["arduino-cli", ["arduino-cli", "upgrade"]],
    ["lib:Servo", ["arduino-cli", "lib", "upgrade", "Servo"]],
  ])("routes %s to its own command", async (id, argv) => {
    await system.load(arduinoMachine({ version: failing, outdated: failing }));
    await expect(provider().update(id)).resolves.toEqual({ id, success: true });
    expect(installArgvs()).toEqual([argv]);
  });

  it("refuses an id with an unknown prefix, running nothing", async () => {
    await system.load(arduinoMachine({ version: failing, outdated: failing }));
    await expect(provider().update("weird:foo")).resolves.toEqual({
      id: "weird:foo",
      success: false,
      message: "id inconnu",
    });
    expect(installArgvs()).toEqual([]);
  });
});
