import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { commandExistsMock, runMock, runInheritMock } = vi.hoisted(() => ({
  commandExistsMock: vi.fn(),
  runMock: vi.fn(),
  runInheritMock: vi.fn(),
}));

vi.mock("../../src/core/runner.js", () => ({
  commandExists: commandExistsMock,
  run: runMock,
  runInherit: runInheritMock,
  isElevated: vi.fn(),
  whichFirst: vi.fn(),
}));

const {
  delegateUpdateMock,
  detectInstallSourceMock,
  describeSourceMock,
} = vi.hoisted(() => ({
  delegateUpdateMock: vi.fn(),
  detectInstallSourceMock: vi.fn(),
  describeSourceMock: vi.fn(),
}));

vi.mock("../../src/core/install-source.js", () => ({
  delegateUpdate: delegateUpdateMock,
  detectInstallSource: detectInstallSourceMock,
  describeSource: describeSourceMock,
}));

const { fetchGitHubReleaseLatestMock } = vi.hoisted(() => ({
  fetchGitHubReleaseLatestMock: vi.fn(),
}));

vi.mock("../../src/core/gh-releases.js", () => ({
  fetchGitHubReleaseLatest: fetchGitHubReleaseLatestMock,
}));

import { ComposerGlobalProvider } from "../../src/providers/dotnet-php/composer-global.js";
import { ComposerSelfProvider } from "../../src/providers/dotnet-php/composer-self.js";
import { DotnetToolsProvider } from "../../src/providers/dotnet-php/dotnet-tools.js";
import { PhiveProvider } from "../../src/providers/dotnet-php/phive.js";
import { SymfonyCliProvider } from "../../src/providers/dotnet-php/symfony-cli.js";

function mkRun(stdout: string, failed = false) {
  return { stdout, stderr: "", exitCode: failed ? 1 : 0, failed };
}

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as unknown as Response;
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  commandExistsMock.mockReset();
  runMock.mockReset();
  runInheritMock.mockReset();
  delegateUpdateMock.mockReset();
  detectInstallSourceMock.mockReset();
  describeSourceMock.mockReset();
  fetchGitHubReleaseLatestMock.mockReset();
  detectInstallSourceMock.mockResolvedValue("scoop");
  describeSourceMock.mockReturnValue("via scoop");
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// composer-global
// ---------------------------------------------------------------------------
describe("composer-global provider", () => {
  it("isAvailable wires to commandExists('composer')", async () => {
    commandExistsMock.mockResolvedValueOnce(true);
    await expect(new ComposerGlobalProvider().isAvailable()).resolves.toBe(true);
    expect(commandExistsMock).toHaveBeenCalledWith("composer");
    commandExistsMock.mockResolvedValueOnce(false);
    await expect(new ComposerGlobalProvider().isAvailable()).resolves.toBe(false);
  });

  it("listOutdated returns [] when stdout is empty/whitespace", async () => {
    runMock.mockResolvedValueOnce(mkRun("   \n"));
    await expect(new ComposerGlobalProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] on invalid JSON", async () => {
    runMock.mockResolvedValueOnce(mkRun("not json"));
    await expect(new ComposerGlobalProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when 'installed' is absent", async () => {
    runMock.mockResolvedValueOnce(mkRun(JSON.stringify({})));
    await expect(new ComposerGlobalProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated filters out packages where version == latest", async () => {
    runMock.mockResolvedValueOnce(
      mkRun(
        JSON.stringify({
          installed: [
            { name: "vendor/up", version: "1.0.0", latest: "1.0.0" },
            { name: "vendor/old", version: "1.0.0", latest: "1.1.0" },
          ],
        }),
      ),
    );
    const rows = await new ComposerGlobalProvider().listOutdated();
    expect(rows).toEqual([
      { id: "vendor/old", name: "vendor/old", current: "1.0.0", latest: "1.1.0" },
    ]);
  });

  it("listOutdated propagates the latest-status as note", async () => {
    runMock.mockResolvedValueOnce(
      mkRun(
        JSON.stringify({
          installed: [
            {
              name: "vendor/old",
              version: "1.0.0",
              latest: "2.0.0",
              "latest-status": "semver-safe-update",
            },
          ],
        }),
      ),
    );
    const rows = await new ComposerGlobalProvider().listOutdated();
    expect(rows[0]).toMatchObject({ note: "semver-safe-update" });
  });

  it("update runs `composer global update <id>` and propagates status", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    let res = await new ComposerGlobalProvider().update("vendor/old");
    expect(res).toEqual({ id: "vendor/old", success: true });
    expect(runInheritMock).toHaveBeenCalledWith("composer", [
      "global",
      "update",
      "vendor/old",
    ]);
    runInheritMock.mockResolvedValueOnce(mkRun("", true));
    res = await new ComposerGlobalProvider().update("vendor/old");
    expect(res.success).toBe(false);
  });

  it("updateAll returns [] on empty input", async () => {
    await expect(new ComposerGlobalProvider().updateAll([])).resolves.toEqual([]);
    expect(runInheritMock).not.toHaveBeenCalled();
  });

  it("updateAll runs `composer global update` once and maps outcomes per package", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new ComposerGlobalProvider().updateAll([
      { id: "vendor/a", name: "vendor/a", current: "1", latest: "2" },
      { id: "vendor/b", name: "vendor/b", current: "1", latest: "2" },
    ]);
    expect(res).toEqual([
      { id: "vendor/a", success: true },
      { id: "vendor/b", success: true },
    ]);
    expect(runInheritMock).toHaveBeenCalledExactlyOnceWith("composer", [
      "global",
      "update",
    ]);
  });

  it("updateAll maps failure to all packages", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun("", true));
    const res = await new ComposerGlobalProvider().updateAll([
      { id: "vendor/a", name: "vendor/a", current: "1", latest: "2" },
    ]);
    expect(res).toEqual([{ id: "vendor/a", success: false }]);
  });
});

// ---------------------------------------------------------------------------
// composer-self
// ---------------------------------------------------------------------------
describe("composer-self provider", () => {
  it("isAvailable wires to commandExists('composer')", async () => {
    commandExistsMock.mockResolvedValueOnce(true);
    await expect(new ComposerSelfProvider().isAvailable()).resolves.toBe(true);
    commandExistsMock.mockResolvedValueOnce(false);
    await expect(new ComposerSelfProvider().isAvailable()).resolves.toBe(false);
  });

  it("listOutdated returns [] when version probe fails", async () => {
    runMock.mockResolvedValueOnce(mkRun("", true));
    await expect(new ComposerSelfProvider().listOutdated()).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("listOutdated returns [] when version cannot be parsed", async () => {
    runMock.mockResolvedValueOnce(mkRun("no version banner"));
    await expect(new ComposerSelfProvider().listOutdated()).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("listOutdated returns [] when Packagist API responds !ok", async () => {
    runMock.mockResolvedValueOnce(mkRun("Composer version 2.7.7 2024-06-10"));
    fetchMock.mockResolvedValueOnce(jsonResponse({}, false));
    await expect(new ComposerSelfProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when fetch throws", async () => {
    runMock.mockResolvedValueOnce(mkRun("Composer version 2.7.7 2024-06-10"));
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    await expect(new ComposerSelfProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when API has no usable versions (filters dev-/pre-release)", async () => {
    runMock.mockResolvedValueOnce(mkRun("Composer version 2.7.7"));
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        package: {
          versions: {
            a: { version: "dev-main" },
            b: { version: "2.8.0-alpha1" },
            c: { version: "2.8.0-beta1" },
            d: { version: "2.8.0-RC1" },
            e: {},
          },
        },
      }),
    );
    await expect(new ComposerSelfProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when latest equals current (with v stripped)", async () => {
    runMock.mockResolvedValueOnce(mkRun("Composer version 2.7.7"));
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        package: { versions: { x: { version: "v2.7.7" } } },
      }),
    );
    await expect(new ComposerSelfProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns a row when newer stable release is found", async () => {
    runMock.mockResolvedValueOnce(mkRun("Composer version 2.7.7 2024-06-10"));
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        package: {
          versions: {
            new: { version: "v2.8.0" },
            old: { version: "v2.7.7" },
          },
        },
      }),
    );
    const rows = await new ComposerSelfProvider().listOutdated();
    expect(rows).toEqual([
      { id: "composer-self", name: "Composer", current: "2.7.7", latest: "2.8.0" },
    ]);
  });

  it("update runs `composer self-update --no-interaction`", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new ComposerSelfProvider().update("composer-self");
    expect(res).toEqual({ id: "composer-self", success: true });
    expect(runInheritMock).toHaveBeenCalledWith("composer", [
      "self-update",
      "--no-interaction",
    ]);
  });

  it("update returns failure when runInherit failed", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun("", true));
    const res = await new ComposerSelfProvider().update("composer-self");
    expect(res).toEqual({ id: "composer-self", success: false });
  });

  it("updateAll returns [] on empty input", async () => {
    await expect(new ComposerSelfProvider().updateAll([])).resolves.toEqual([]);
    expect(runInheritMock).not.toHaveBeenCalled();
  });

  it("updateAll delegates to update() once when packages exist", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new ComposerSelfProvider().updateAll([
      { id: "composer-self", name: "Composer", current: "2.7.7", latest: "2.8.0" },
    ]);
    expect(res).toEqual([{ id: "composer-self", success: true }]);
  });
});

// ---------------------------------------------------------------------------
// dotnet-tools
// ---------------------------------------------------------------------------
describe("dotnet-tools provider", () => {
  const header = "Package Id      Version      Commands";

  it("isAvailable wires to commandExists('dotnet')", async () => {
    commandExistsMock.mockResolvedValueOnce(true);
    await expect(new DotnetToolsProvider().isAvailable()).resolves.toBe(true);
    commandExistsMock.mockResolvedValueOnce(false);
    await expect(new DotnetToolsProvider().isAvailable()).resolves.toBe(false);
  });

  it("listOutdated returns [] when header line is missing", async () => {
    runMock.mockResolvedValueOnce(mkRun("no header here"));
    await expect(new DotnetToolsProvider().listOutdated()).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("listOutdated returns [] when only header is present (no tools)", async () => {
    runMock.mockResolvedValueOnce(mkRun([header, "----------------"].join("\n")));
    await expect(new DotnetToolsProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated skips blank rows and tolerates malformed columns", async () => {
    const stdout = [
      header,
      "------------------",
      "",
      "soloname",
      "dotnet-ef    7.0.0    dotnet-ef",
    ].join("\n");
    runMock.mockResolvedValueOnce(mkRun(stdout));
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: [{ id: "dotnet-ef", version: "7.0.0" }] }));
    // only the well-formed line probed -> same version -> no row
    await expect(new DotnetToolsProvider().listOutdated()).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("listOutdated skips a tool when NuGet API responds !ok", async () => {
    runMock.mockResolvedValueOnce(
      mkRun([header, "----", "dotnet-ef 7.0.0 dotnet-ef"].join("\n")),
    );
    fetchMock.mockResolvedValueOnce(jsonResponse({}, false));
    await expect(new DotnetToolsProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated skips a tool when fetch throws", async () => {
    runMock.mockResolvedValueOnce(
      mkRun([header, "----", "dotnet-ef 7.0.0 dotnet-ef"].join("\n")),
    );
    fetchMock.mockRejectedValueOnce(new Error("ECONNRESET"));
    await expect(new DotnetToolsProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated skips a tool when NuGet returns no data", async () => {
    runMock.mockResolvedValueOnce(
      mkRun([header, "----", "dotnet-ef 7.0.0 dotnet-ef"].join("\n")),
    );
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: [] }));
    await expect(new DotnetToolsProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated emits a row when versions differ", async () => {
    runMock.mockResolvedValueOnce(
      mkRun([header, "----", "dotnet-ef 7.0.0 dotnet-ef"].join("\n")),
    );
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ data: [{ id: "dotnet-ef", version: "8.0.1" }] }),
    );
    const rows = await new DotnetToolsProvider().listOutdated();
    expect(rows).toEqual([
      { id: "dotnet-ef", name: "dotnet-ef", current: "7.0.0", latest: "8.0.1" },
    ]);
  });

  it("update runs `dotnet tool update -g <id>` and propagates status", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    let res = await new DotnetToolsProvider().update("dotnet-ef");
    expect(res).toEqual({ id: "dotnet-ef", success: true });
    expect(runInheritMock).toHaveBeenCalledWith("dotnet", [
      "tool",
      "update",
      "-g",
      "dotnet-ef",
    ]);
    runInheritMock.mockResolvedValueOnce(mkRun("", true));
    res = await new DotnetToolsProvider().update("dotnet-ef");
    expect(res.success).toBe(false);
  });

  it("updateAll returns [] on empty input (no calls)", async () => {
    await expect(new DotnetToolsProvider().updateAll([])).resolves.toEqual([]);
    expect(runInheritMock).not.toHaveBeenCalled();
  });

  it("updateAll iterates sequentially over packages", async () => {
    runInheritMock
      .mockResolvedValueOnce(mkRun(""))
      .mockResolvedValueOnce(mkRun("", true));
    const res = await new DotnetToolsProvider().updateAll([
      { id: "a", name: "a", current: "1", latest: "2" },
      { id: "b", name: "b", current: "1", latest: "2" },
    ]);
    expect(res).toEqual([
      { id: "a", success: true },
      { id: "b", success: false },
    ]);
    expect(runInheritMock.mock.calls.map((c) => c[1])).toEqual([
      ["tool", "update", "-g", "a"],
      ["tool", "update", "-g", "b"],
    ]);
  });
});

// ---------------------------------------------------------------------------
// phive
// ---------------------------------------------------------------------------
describe("phive provider", () => {
  it("isAvailable wires to commandExists('phive')", async () => {
    commandExistsMock.mockResolvedValueOnce(true);
    await expect(new PhiveProvider().isAvailable()).resolves.toBe(true);
    commandExistsMock.mockResolvedValueOnce(false);
    await expect(new PhiveProvider().isAvailable()).resolves.toBe(false);
  });

  it("listOutdated returns [] when probe fails", async () => {
    runMock.mockResolvedValueOnce(mkRun("", true));
    await expect(new PhiveProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when version cannot be parsed", async () => {
    runMock.mockResolvedValueOnce(mkRun("no version here"));
    await expect(new PhiveProvider().listOutdated()).resolves.toEqual([]);
    expect(fetchGitHubReleaseLatestMock).not.toHaveBeenCalled();
  });

  it("listOutdated returns [] when GH fetch is null", async () => {
    runMock.mockResolvedValueOnce(mkRun("phive 0.15.2"));
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce(null);
    await expect(new PhiveProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when current == latest", async () => {
    runMock.mockResolvedValueOnce(mkRun("phive 0.15.2"));
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("0.15.2");
    await expect(new PhiveProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns a row when versions differ", async () => {
    runMock.mockResolvedValueOnce(mkRun("phive 0.15.2"));
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("0.16.0");
    const rows = await new PhiveProvider().listOutdated();
    expect(rows).toEqual([
      { id: "phive", name: "PHIVE", current: "0.15.2", latest: "0.16.0" },
    ]);
  });

  it("update runs `phive selfupdate` and propagates status", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    let res = await new PhiveProvider().update("phive");
    expect(res).toEqual({ id: "phive", success: true });
    expect(runInheritMock).toHaveBeenCalledWith("phive", ["selfupdate"]);
    runInheritMock.mockResolvedValueOnce(mkRun("", true));
    res = await new PhiveProvider().update("phive");
    expect(res.success).toBe(false);
  });

  it("updateAll returns [] on empty input", async () => {
    await expect(new PhiveProvider().updateAll([])).resolves.toEqual([]);
    expect(runInheritMock).not.toHaveBeenCalled();
  });

  it("updateAll delegates once when packages present", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new PhiveProvider().updateAll([
      { id: "phive", name: "PHIVE", current: "0.15.2", latest: "0.16.0" },
    ]);
    expect(res).toEqual([{ id: "phive", success: true }]);
  });
});

// ---------------------------------------------------------------------------
// symfony-cli
// ---------------------------------------------------------------------------
describe("symfony-cli provider", () => {
  it("isAvailable wires to commandExists('symfony')", async () => {
    commandExistsMock.mockResolvedValueOnce(true);
    await expect(new SymfonyCliProvider().isAvailable()).resolves.toBe(true);
    commandExistsMock.mockResolvedValueOnce(false);
    await expect(new SymfonyCliProvider().isAvailable()).resolves.toBe(false);
  });

  it("listOutdated returns [] when version line is missing", async () => {
    runMock.mockResolvedValueOnce(mkRun("no version pattern in output"));
    await expect(new SymfonyCliProvider().listOutdated()).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("listOutdated returns [] when GitHub API responds !ok", async () => {
    runMock.mockResolvedValueOnce(mkRun("Symfony CLI version v5.10.0"));
    fetchMock.mockResolvedValueOnce(jsonResponse({}, false));
    await expect(new SymfonyCliProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when fetch throws", async () => {
    runMock.mockResolvedValueOnce(mkRun("Symfony CLI version v5.10.0"));
    fetchMock.mockRejectedValueOnce(new Error("net"));
    await expect(new SymfonyCliProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when API has no tag_name", async () => {
    runMock.mockResolvedValueOnce(mkRun("Symfony CLI version v5.10.0"));
    fetchMock.mockResolvedValueOnce(jsonResponse({}));
    await expect(new SymfonyCliProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when normalized latest == current", async () => {
    runMock.mockResolvedValueOnce(mkRun("Symfony CLI version v5.10.0"));
    fetchMock.mockResolvedValueOnce(jsonResponse({ tag_name: "v5.10.0" }));
    await expect(new SymfonyCliProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns a row when versions differ", async () => {
    runMock.mockResolvedValueOnce(mkRun("Symfony CLI version v5.10.0 (build)"));
    fetchMock.mockResolvedValueOnce(jsonResponse({ tag_name: "v5.11.0" }));
    detectInstallSourceMock.mockResolvedValueOnce("scoop");
    describeSourceMock.mockReturnValueOnce("via scoop");

    const rows = await new SymfonyCliProvider().listOutdated();
    expect(rows).toEqual([
      {
        id: "symfony-cli",
        name: "Symfony CLI",
        current: "5.10.0",
        latest: "5.11.0",
        note: "via scoop",
      },
    ]);
    expect(detectInstallSourceMock).toHaveBeenCalledWith("symfony");
  });

  it("listOutdated flags manual installs", async () => {
    runMock.mockResolvedValueOnce(mkRun("Symfony CLI version v5.10.0"));
    fetchMock.mockResolvedValueOnce(jsonResponse({ tag_name: "v5.11.0" }));
    detectInstallSourceMock.mockResolvedValueOnce("manual");
    describeSourceMock.mockReturnValueOnce("manuel");

    const rows = await new SymfonyCliProvider().listOutdated();
    expect(rows[0]).toMatchObject({ manual: true, note: "manuel" });
  });

  it("update delegates with SensioLabs.Symfony-Cli winget id", async () => {
    delegateUpdateMock.mockResolvedValueOnce({ id: "symfony-cli", success: true });
    await new SymfonyCliProvider().update("symfony-cli");
    const arg = delegateUpdateMock.mock.calls[0]![0] as {
      id: string;
      binary: string;
      packageIds: { scoop?: string; choco?: string; winget?: string };
      manualMessage: string;
    };
    expect(arg).toMatchObject({
      id: "symfony-cli",
      binary: "symfony",
      packageIds: {
        scoop: "symfony-cli",
        choco: "symfony-cli",
        winget: "SensioLabs.Symfony-Cli",
      },
    });
    expect(arg.manualMessage).toEqual(expect.any(String));
  });

  it("updateAll returns [] on empty input", async () => {
    await expect(new SymfonyCliProvider().updateAll([])).resolves.toEqual([]);
    expect(delegateUpdateMock).not.toHaveBeenCalled();
  });

  it("updateAll delegates once when packages exist", async () => {
    delegateUpdateMock.mockResolvedValueOnce({ id: "symfony-cli", success: false });
    const res = await new SymfonyCliProvider().updateAll([
      { id: "symfony-cli", name: "Symfony CLI", current: "5.10.0", latest: "5.11.0" },
    ]);
    expect(res).toEqual([{ id: "symfony-cli", success: false }]);
  });
});
