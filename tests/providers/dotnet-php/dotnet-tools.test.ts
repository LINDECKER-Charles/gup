import { describe, expect, it } from "vitest";
import { DotnetToolsProvider } from "../../../src/providers/dotnet-php/dotnet-tools.js";
import { system } from "../../support/system/fake-system.js";
import { installArgvs } from "../../support/system/trace.js";
import { nugetSearchRoute, nugetSearchUrl, toolsMachine } from "./dotnet-php.cases.js";

/**
 * .NET global tools: `dotnet tool list -g` read as a table under its header,
 * each tool's latest stable version asked of NuGet's search API.
 */

describe("DotnetToolsProvider.listOutdated", () => {
  it("asks NuGet nothing when no tool sits under the header", async () => {
    await system.load(toolsMachine([], []));
    await expect(new DotnetToolsProvider().listOutdated()).resolves.toEqual([]);
    expect(system.trace.requests).toEqual([]);
  });

  it("looks up only the well-formed rows, skipping blank and one-column lines", async () => {
    const rows = ["", "soloname", "dotnet-ef    7.0.0    dotnet-ef"];
    await system.load(toolsMachine(rows, [nugetSearchRoute("dotnet-ef", "7.0.0")]));
    await expect(new DotnetToolsProvider().listOutdated()).resolves.toEqual([]);
    expect(system.trace.requests.map((request) => request.url)).toEqual([
      nugetSearchUrl("dotnet-ef"),
    ]);
  });

  it("skips a tool NuGet returns no package for", async () => {
    const empty = { url: nugetSearchUrl("dotnet-ef"), json: { data: [] } };
    await system.load(toolsMachine(["dotnet-ef    7.0.0    dotnet-ef"], [empty]));
    await expect(new DotnetToolsProvider().listOutdated()).resolves.toEqual([]);
  });
});

describe("DotnetToolsProvider.updateAll", () => {
  it("updates tool by tool, each outcome its own install's", async () => {
    await system.load(toolsMachine([], []));
    system.answerInstall({ exitCode: 0 }, { exitCode: 1 });
    const outcomes = await new DotnetToolsProvider().updateAll([
      { id: "dotnet-ef", current: "7.0.0", latest: "8.0.1" },
      { id: "csharpier", current: "0.28.2", latest: "0.29.2" },
    ]);
    expect(outcomes).toEqual([
      { id: "dotnet-ef", success: true },
      { id: "csharpier", success: false },
    ]);
    expect(installArgvs()).toEqual([
      ["dotnet", "tool", "update", "-g", "dotnet-ef"],
      ["dotnet", "tool", "update", "-g", "csharpier"],
    ]);
  });
});
