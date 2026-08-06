import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { commandExistsMock, runMock, runInheritMock, isElevatedMock, whichFirstMock } =
  vi.hoisted(() => ({
    commandExistsMock: vi.fn(),
    runMock: vi.fn(),
    runInheritMock: vi.fn(),
    isElevatedMock: vi.fn(),
    whichFirstMock: vi.fn(),
  }));

const { fetchGitHubReleaseLatestMock, normalizeVersionMock } = vi.hoisted(() => ({
  fetchGitHubReleaseLatestMock: vi.fn(),
  normalizeVersionMock: vi.fn((v: string) => v.trim().replace(/^v/i, "").toLowerCase()),
}));

const {
  delegateUpdateMock,
  detectInstallSourceMock,
  describeSourceMock,
  runPmUpdateMock,
} = vi.hoisted(() => ({
  delegateUpdateMock: vi.fn(),
  detectInstallSourceMock: vi.fn(),
  describeSourceMock: vi.fn(),
  runPmUpdateMock: vi.fn(),
}));

vi.mock("../../src/core/runner.js", () => ({
  commandExists: commandExistsMock,
  run: runMock,
  runInherit: runInheritMock,
  isElevated: isElevatedMock,
  whichFirst: whichFirstMock,
}));

vi.mock("../../src/core/gh-releases.js", () => ({
  fetchGitHubReleaseLatest: fetchGitHubReleaseLatestMock,
  normalizeVersion: normalizeVersionMock,
}));

vi.mock("../../src/core/install-source.js", () => ({
  delegateUpdate: delegateUpdateMock,
  detectInstallSource: detectInstallSourceMock,
  describeSource: describeSourceMock,
  runPmUpdate: runPmUpdateMock,
}));

import { OpenTofuProvider } from "../../src/providers/iac/opentofu.js";
import { TerragruntProvider } from "../../src/providers/iac/terragrunt.js";
import { TFLintProvider } from "../../src/providers/iac/tflint.js";
import { PulumiProvider } from "../../src/providers/iac/pulumi.js";

function mkRun(stdout: string, failed = false) {
  return { stdout, stderr: "", exitCode: failed ? 1 : 0, failed };
}

let fetchMock: ReturnType<typeof vi.fn>;
const jsonResponse = (body: unknown, ok = true) =>
  ({ ok, json: async () => body }) as unknown as Response;

beforeEach(() => {
  commandExistsMock.mockReset();
  runMock.mockReset();
  runInheritMock.mockReset();
  isElevatedMock.mockReset();
  whichFirstMock.mockReset();
  fetchGitHubReleaseLatestMock.mockReset();
  delegateUpdateMock.mockReset();
  detectInstallSourceMock.mockReset();
  describeSourceMock.mockReset();
  runPmUpdateMock.mockReset();
  detectInstallSourceMock.mockResolvedValue("scoop");
  describeSourceMock.mockReturnValue("via scoop");
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

interface GhSpec {
  name: string;
  Ctor: new () => {
    isAvailable(): Promise<boolean>;
    listOutdated(): Promise<
      Array<{ id: string; current: string; latest: string; note?: string; manual?: boolean }>
    >;
    update(id: string): Promise<{ id: string; success: boolean }>;
    updateAll(
      pkgs: Array<{ id: string; current: string; latest: string }>,
    ): Promise<Array<{ id: string; success: boolean }>>;
  };
  binary: string;
  versionArgs: string[];
  versionStdout: (v: string) => string;
  unparsable: string;
  displayName: string;
  wingetId: string;
  scoopId: string;
  chocoId: string;
  /** Absent when the tool has no Homebrew formula to delegate to. */
  brewId?: string;
}

const ghSpecs: GhSpec[] = [
  {
    name: "opentofu",
    Ctor: OpenTofuProvider,
    binary: "tofu",
    versionArgs: ["version"],
    versionStdout: (v) => `OpenTofu v${v}\non darwin_amd64`,
    unparsable: "no relevant version banner",
    displayName: "OpenTofu",
    wingetId: "OpenTofu.Tofu",
    scoopId: "opentofu",
    chocoId: "opentofu",
    brewId: "opentofu",
  },
  {
    name: "terragrunt",
    Ctor: TerragruntProvider,
    binary: "terragrunt",
    versionArgs: ["--version"],
    versionStdout: (v) => `terragrunt version v${v}`,
    unparsable: "no version found here",
    displayName: "Terragrunt",
    wingetId: "Gruntwork.Terragrunt",
    scoopId: "terragrunt",
    chocoId: "terragrunt",
    brewId: "terragrunt",
  },
  {
    name: "tflint",
    Ctor: TFLintProvider,
    binary: "tflint",
    versionArgs: ["--version"],
    versionStdout: (v) => `TFLint version ${v}\n+ ruleset.terraform (0.5.0)`,
    unparsable: "no version banner present",
    displayName: "TFLint",
    wingetId: "TerraformLinters.tflint",
    scoopId: "tflint",
    chocoId: "tflint",
  },
];

for (const spec of ghSpecs) {
  describe(`${spec.name} provider`, () => {
    it("isAvailable returns true when binary is found", async () => {
      commandExistsMock.mockResolvedValueOnce(true);
      await expect(new spec.Ctor().isAvailable()).resolves.toBe(true);
      expect(commandExistsMock).toHaveBeenCalledWith(spec.binary);
    });

    it("isAvailable returns false when binary is missing", async () => {
      commandExistsMock.mockResolvedValueOnce(false);
      await expect(new spec.Ctor().isAvailable()).resolves.toBe(false);
    });

    it("listOutdated returns [] when version probe fails", async () => {
      runMock.mockResolvedValueOnce(mkRun("", true));
      await expect(new spec.Ctor().listOutdated()).resolves.toEqual([]);
      expect(fetchGitHubReleaseLatestMock).not.toHaveBeenCalled();
    });

    it("listOutdated returns [] when current version cannot be parsed", async () => {
      runMock.mockResolvedValueOnce(mkRun(spec.unparsable));
      await expect(new spec.Ctor().listOutdated()).resolves.toEqual([]);
      expect(fetchGitHubReleaseLatestMock).not.toHaveBeenCalled();
    });

    it("listOutdated returns [] when fetchGitHubReleaseLatest returns null", async () => {
      runMock.mockResolvedValueOnce(mkRun(spec.versionStdout("1.0.0")));
      fetchGitHubReleaseLatestMock.mockResolvedValueOnce(null);
      await expect(new spec.Ctor().listOutdated()).resolves.toEqual([]);
    });

    it("listOutdated returns [] when current equals latest", async () => {
      runMock.mockResolvedValueOnce(mkRun(spec.versionStdout("1.2.3")));
      fetchGitHubReleaseLatestMock.mockResolvedValueOnce("1.2.3");
      await expect(new spec.Ctor().listOutdated()).resolves.toEqual([]);
    });

    it("listOutdated returns a row when versions differ", async () => {
      runMock.mockResolvedValueOnce(mkRun(spec.versionStdout("1.0.0")));
      fetchGitHubReleaseLatestMock.mockResolvedValueOnce("1.2.3");
      detectInstallSourceMock.mockResolvedValueOnce("winget");
      describeSourceMock.mockReturnValueOnce("via winget");

      const rows = await new spec.Ctor().listOutdated();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        id: spec.name,
        current: "1.0.0",
        latest: "1.2.3",
        note: "via winget",
      });
      expect(rows[0]).not.toHaveProperty("manual");
      expect(detectInstallSourceMock).toHaveBeenCalledWith(spec.binary);
    });

    it("listOutdated flags manual installs", async () => {
      runMock.mockResolvedValueOnce(mkRun(spec.versionStdout("1.0.0")));
      fetchGitHubReleaseLatestMock.mockResolvedValueOnce("2.0.0");
      detectInstallSourceMock.mockResolvedValueOnce("manual");
      describeSourceMock.mockReturnValueOnce("manuel");

      const rows = await new spec.Ctor().listOutdated();
      expect(rows[0]).toMatchObject({ manual: true, note: "manuel" });
    });

    it("update delegates with the expected package ids", async () => {
      delegateUpdateMock.mockResolvedValueOnce({ id: spec.name, success: true });
      const res = await new spec.Ctor().update(spec.name);
      expect(res).toEqual({ id: spec.name, success: true });
      expect(delegateUpdateMock).toHaveBeenCalledTimes(1);
      const call = delegateUpdateMock.mock.calls[0]![0] as {
        id: string;
        binary: string;
        packageIds: {
          scoop?: string;
          choco?: string;
          winget?: string;
          brew?: string;
        };
        manualMessage?: string;
      };
      expect(call.id).toBe(spec.name);
      expect(call.binary).toBe(spec.binary);
      expect(call.packageIds).toEqual({
        scoop: spec.scoopId,
        choco: spec.chocoId,
        winget: spec.wingetId,
        ...(spec.brewId && { brew: spec.brewId }),
      });
      // French manualMessage present (matched loosely on a stable substring)
      expect(call.manualMessage).toMatch(/remplacer|installer/i);
    });

    it("update bubbles up a failed outcome", async () => {
      delegateUpdateMock.mockResolvedValueOnce({ id: spec.name, success: false });
      const res = await new spec.Ctor().update(spec.name);
      expect(res).toEqual({ id: spec.name, success: false });
    });

    it("updateAll returns [] when no packages", async () => {
      const res = await new spec.Ctor().updateAll([]);
      expect(res).toEqual([]);
      expect(delegateUpdateMock).not.toHaveBeenCalled();
    });

    it("updateAll delegates once when packages are present", async () => {
      delegateUpdateMock.mockResolvedValueOnce({ id: spec.name, success: true });
      const res = await new spec.Ctor().updateAll([
        {
          id: spec.name,
          name: spec.displayName,
          current: "1.0.0",
          latest: "1.2.3",
        } as never,
      ]);
      expect(res).toEqual([{ id: spec.name, success: true }]);
      expect(delegateUpdateMock).toHaveBeenCalledTimes(1);
    });
  });
}

describe("pulumi provider", () => {
  it("isAvailable returns true when binary is found", async () => {
    commandExistsMock.mockResolvedValueOnce(true);
    await expect(new PulumiProvider().isAvailable()).resolves.toBe(true);
    expect(commandExistsMock).toHaveBeenCalledWith("pulumi");
  });

  it("isAvailable returns false when binary is missing", async () => {
    commandExistsMock.mockResolvedValueOnce(false);
    await expect(new PulumiProvider().isAvailable()).resolves.toBe(false);
  });

  it("listOutdated returns [] when version probe fails", async () => {
    runMock.mockResolvedValueOnce(mkRun("", true));
    await expect(new PulumiProvider().listOutdated()).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("listOutdated returns [] when version stdout trims to empty", async () => {
    runMock.mockResolvedValueOnce(mkRun("   \n  "));
    await expect(new PulumiProvider().listOutdated()).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("listOutdated returns [] when GitHub API is !ok", async () => {
    runMock.mockResolvedValueOnce(mkRun("v3.120.0"));
    fetchMock.mockResolvedValueOnce(jsonResponse({}, false));
    await expect(new PulumiProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when tag_name is absent in JSON", async () => {
    runMock.mockResolvedValueOnce(mkRun("v3.120.0"));
    fetchMock.mockResolvedValueOnce(jsonResponse({}));
    await expect(new PulumiProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when fetch throws (network error)", async () => {
    runMock.mockResolvedValueOnce(mkRun("v3.120.0"));
    fetchMock.mockImplementationOnce(() => {
      throw new Error("network down");
    });
    await expect(new PulumiProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when current equals latest (v prefix normalized)", async () => {
    runMock.mockResolvedValueOnce(mkRun("v3.120.0\n"));
    fetchMock.mockResolvedValueOnce(jsonResponse({ tag_name: "v3.120.0" }));
    await expect(new PulumiProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns a row when versions differ", async () => {
    runMock.mockResolvedValueOnce(mkRun("v3.120.0\n"));
    fetchMock.mockResolvedValueOnce(jsonResponse({ tag_name: "v3.125.0" }));
    detectInstallSourceMock.mockResolvedValueOnce("choco");
    describeSourceMock.mockReturnValueOnce("via choco");

    const rows = await new PulumiProvider().listOutdated();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: "pulumi",
      name: "Pulumi",
      current: "3.120.0",
      latest: "3.125.0",
      note: "via choco",
    });
    expect(rows[0]).not.toHaveProperty("manual");
  });

  it("listOutdated flags manual installs", async () => {
    runMock.mockResolvedValueOnce(mkRun("v3.120.0"));
    fetchMock.mockResolvedValueOnce(jsonResponse({ tag_name: "v3.125.0" }));
    detectInstallSourceMock.mockResolvedValueOnce("manual");
    describeSourceMock.mockReturnValueOnce("manuel");

    const rows = await new PulumiProvider().listOutdated();
    expect(rows[0]).toMatchObject({ manual: true, note: "manuel" });
  });

  it("update delegates with Pulumi.Pulumi winget id and French manual message", async () => {
    delegateUpdateMock.mockResolvedValueOnce({ id: "pulumi", success: true });
    await new PulumiProvider().update("pulumi");
    const call = delegateUpdateMock.mock.calls[0]![0] as {
      id: string;
      binary: string;
      packageIds: { scoop?: string; choco?: string; winget?: string; brew?: string };
      manualMessage?: string;
    };
    expect(call.id).toBe("pulumi");
    expect(call.binary).toBe("pulumi");
    expect(call.packageIds).toEqual({
      scoop: "pulumi",
      choco: "pulumi",
      winget: "Pulumi.Pulumi",
      brew: "pulumi",
    });
    expect(call.manualMessage).toMatch(/installer/i);
  });

  it("update can return a failed outcome", async () => {
    delegateUpdateMock.mockResolvedValueOnce({ id: "pulumi", success: false });
    await expect(new PulumiProvider().update("pulumi")).resolves.toEqual({
      id: "pulumi",
      success: false,
    });
  });

  it("updateAll short-circuits on empty array", async () => {
    await expect(new PulumiProvider().updateAll([])).resolves.toEqual([]);
    expect(delegateUpdateMock).not.toHaveBeenCalled();
  });

  it("updateAll returns a single outcome when packages are present", async () => {
    delegateUpdateMock.mockResolvedValueOnce({ id: "pulumi", success: true });
    const res = await new PulumiProvider().updateAll([
      { id: "pulumi", name: "Pulumi", current: "3.120.0", latest: "3.125.0" } as never,
    ]);
    expect(res).toEqual([{ id: "pulumi", success: true }]);
    expect(delegateUpdateMock).toHaveBeenCalledTimes(1);
  });
});
