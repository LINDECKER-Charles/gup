import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { commandExistsMock, runMock, runInheritMock, whichFirstMock } = vi.hoisted(() => ({
  commandExistsMock: vi.fn(),
  runMock: vi.fn(),
  runInheritMock: vi.fn(),
  whichFirstMock: vi.fn(),
}));

vi.mock("../../src/core/runner.js", () => ({
  commandExists: commandExistsMock,
  run: runMock,
  runInherit: runInheritMock,
  isElevated: vi.fn(),
  whichFirst: whichFirstMock,
}));

const { existsSyncMock } = vi.hoisted(() => ({
  existsSyncMock: vi.fn(),
}));

vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  return { ...actual, existsSync: existsSyncMock };
});

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

vi.mock("../../src/core/install-source.js", () => ({
  delegateUpdate: delegateUpdateMock,
  detectInstallSource: detectInstallSourceMock,
  describeSource: describeSourceMock,
  runPmUpdate: runPmUpdateMock,
}));

const {
  fetchGitHubReleaseLatestMock,
  fetchGitHubReleaseTagMatchingMock,
  normalizeVersionMock,
} = vi.hoisted(() => ({
  fetchGitHubReleaseLatestMock: vi.fn(),
  fetchGitHubReleaseTagMatchingMock: vi.fn(),
  normalizeVersionMock: vi.fn((v: string) => v.replace(/^v/, "")),
}));

vi.mock("../../src/core/gh-releases.js", () => ({
  fetchGitHubReleaseLatest: fetchGitHubReleaseLatestMock,
  fetchGitHubReleaseTagMatching: fetchGitHubReleaseTagMatchingMock,
  normalizeVersion: normalizeVersionMock,
}));

import { CosignProvider } from "../../src/providers/security/cosign.js";
import { GitsignProvider } from "../../src/providers/security/gitsign.js";
import { GrypeProvider } from "../../src/providers/security/grype.js";
import { NucleiProvider } from "../../src/providers/security/nuclei.js";
import { NucleiTemplatesProvider } from "../../src/providers/security/nuclei-templates.js";
import { PdtmProvider } from "../../src/providers/security/pdtm.js";
import { RekorProvider } from "../../src/providers/security/rekor.js";
import { SemgrepProvider } from "../../src/providers/security/semgrep.js";
import { SyftProvider } from "../../src/providers/security/syft.js";
import { TrivyProvider } from "../../src/providers/security/trivy.js";

function mkRun(stdout: string, failed = false, stderr = "") {
  return { stdout, stderr, exitCode: failed ? 1 : 0, failed };
}

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as unknown as Response;
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  commandExistsMock.mockReset();
  runMock.mockReset();
  runInheritMock.mockReset();
  whichFirstMock.mockReset();
  existsSyncMock.mockReset();
  delegateUpdateMock.mockReset();
  detectInstallSourceMock.mockReset();
  describeSourceMock.mockReset();
  runPmUpdateMock.mockReset();
  fetchGitHubReleaseLatestMock.mockReset();
  fetchGitHubReleaseTagMatchingMock.mockReset();
  detectInstallSourceMock.mockResolvedValue("scoop");
  describeSourceMock.mockReturnValue("via scoop");
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// Shared spec for GH-backed delegating providers (cosign / gitsign / grype /
// rekor / syft / trivy).
// ---------------------------------------------------------------------------

interface DelegatedSpec {
  name: string;
  Ctor: new () => {
    id: string;
    isAvailable(): Promise<boolean>;
    listOutdated(): Promise<Array<{ id: string; current: string; latest: string; manual?: boolean; note?: string }>>;
    update(id: string): Promise<{ id: string; success: boolean }>;
    updateAll(pkgs: Array<{ id: string }>): Promise<Array<{ id: string; success: boolean }>>;
  };
  binary: string;
  ghRepo: string;
  versionArgs: string[];
  versionStdout: (v: string) => string;
  unparsable: string;
  expectedId: string;
  expectedPackageIds: {
    scoop?: string;
    choco?: string;
    winget?: string;
    brew?: string;
  };
}

const delegatedSpecs: DelegatedSpec[] = [
  {
    name: "cosign",
    Ctor: CosignProvider,
    binary: "cosign",
    ghRepo: "sigstore/cosign",
    versionArgs: ["version"],
    versionStdout: (v) => `GitVersion:    v${v}\nGitCommit: abc`,
    unparsable: "no version line here",
    expectedId: "cosign",
    expectedPackageIds: {
      scoop: "cosign",
      choco: "cosign",
      winget: "sigstore.cosign",
      brew: "cosign",
    },
  },
  {
    name: "grype",
    Ctor: GrypeProvider,
    binary: "grype",
    ghRepo: "anchore/grype",
    versionArgs: ["version"],
    versionStdout: (v) => `Application:        grype\nVersion:    ${v}\n`,
    unparsable: "irrelevant",
    expectedId: "grype",
    expectedPackageIds: {
      scoop: "grype",
      choco: "grype",
      winget: "Anchore.Grype",
      brew: "grype",
    },
  },
  {
    name: "rekor",
    Ctor: RekorProvider,
    binary: "rekor-cli",
    ghRepo: "sigstore/rekor",
    versionArgs: ["version"],
    versionStdout: (v) => `GitVersion:    v${v}\nGitCommit: abc`,
    unparsable: "irrelevant",
    expectedId: "rekor",
    expectedPackageIds: { scoop: "rekor-cli", brew: "rekor-cli" },
  },
  {
    name: "syft",
    Ctor: SyftProvider,
    binary: "syft",
    ghRepo: "anchore/syft",
    versionArgs: ["version"],
    versionStdout: (v) => `Application:        syft\nVersion:    ${v}\n`,
    unparsable: "irrelevant",
    expectedId: "syft",
    expectedPackageIds: {
      scoop: "syft",
      choco: "syft",
      winget: "Anchore.Syft",
      brew: "syft",
    },
  },
  {
    name: "trivy",
    Ctor: TrivyProvider,
    binary: "trivy",
    ghRepo: "aquasecurity/trivy",
    versionArgs: ["--version"],
    versionStdout: (v) => `Version: ${v}\nVulnerability DB:\n`,
    unparsable: "irrelevant",
    expectedId: "trivy",
    expectedPackageIds: {
      scoop: "trivy",
      choco: "trivy",
      winget: "AquaSecurity.Trivy",
      brew: "trivy",
    },
  },
];

for (const spec of delegatedSpecs) {
  describe(`${spec.name} provider`, () => {
    it("isAvailable wires through commandExists (true/false)", async () => {
      commandExistsMock.mockResolvedValueOnce(true);
      await expect(new spec.Ctor().isAvailable()).resolves.toBe(true);
      expect(commandExistsMock).toHaveBeenCalledWith(spec.binary);

      commandExistsMock.mockResolvedValueOnce(false);
      await expect(new spec.Ctor().isAvailable()).resolves.toBe(false);
    });

    it("listOutdated returns [] when version probe fails", async () => {
      runMock.mockResolvedValueOnce(mkRun("", true));
      await expect(new spec.Ctor().listOutdated()).resolves.toEqual([]);
      expect(fetchGitHubReleaseLatestMock).not.toHaveBeenCalled();
    });

    it("listOutdated returns [] when current cannot be parsed", async () => {
      runMock.mockResolvedValueOnce(mkRun(spec.unparsable));
      await expect(new spec.Ctor().listOutdated()).resolves.toEqual([]);
      expect(fetchGitHubReleaseLatestMock).not.toHaveBeenCalled();
    });

    it("listOutdated returns [] when fetchGitHubReleaseLatest is null", async () => {
      runMock.mockResolvedValueOnce(mkRun(spec.versionStdout("1.0.0")));
      fetchGitHubReleaseLatestMock.mockResolvedValueOnce(null);
      await expect(new spec.Ctor().listOutdated()).resolves.toEqual([]);
      expect(fetchGitHubReleaseLatestMock).toHaveBeenCalledWith(spec.ghRepo);
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
        id: spec.expectedId,
        current: "1.0.0",
        latest: "1.2.3",
        note: "via winget",
      });
      expect(rows[0]).not.toHaveProperty("manual");
    });

    it("listOutdated flags manual installs", async () => {
      runMock.mockResolvedValueOnce(mkRun(spec.versionStdout("1.0.0")));
      fetchGitHubReleaseLatestMock.mockResolvedValueOnce("2.0.0");
      detectInstallSourceMock.mockResolvedValueOnce("manual");
      describeSourceMock.mockReturnValueOnce("manuel");

      const rows = await new spec.Ctor().listOutdated();
      expect(rows[0]).toMatchObject({ manual: true });
    });

    it("update delegates with the expected package ids", async () => {
      delegateUpdateMock.mockResolvedValueOnce({ id: spec.expectedId, success: true });
      const res = await new spec.Ctor().update(spec.expectedId);
      expect(res).toEqual({ id: spec.expectedId, success: true });
      const call = delegateUpdateMock.mock.calls[0]![0] as {
        id: string;
        binary: string;
        packageIds: { scoop?: string; choco?: string; winget?: string };
        manualMessage: string;
      };
      expect(call.id).toBe(spec.expectedId);
      expect(call.binary).toBe(spec.binary);
      expect(call.packageIds).toEqual(spec.expectedPackageIds);
      expect(typeof call.manualMessage).toBe("string");
    });

    it("updateAll returns [] when no packages", async () => {
      const res = await new spec.Ctor().updateAll([]);
      expect(res).toEqual([]);
      expect(delegateUpdateMock).not.toHaveBeenCalled();
    });

    it("updateAll calls update once when packages present", async () => {
      delegateUpdateMock.mockResolvedValueOnce({ id: spec.expectedId, success: true });
      const res = await new spec.Ctor().updateAll([{ id: spec.expectedId } as never]);
      expect(res).toEqual([{ id: spec.expectedId, success: true }]);
    });
  });
}

// ---------------------------------------------------------------------------
// gitsign — same shape as the delegated ones but with two parsing branches
// (GitVersion: vs version), so we test it separately to cover both.
// ---------------------------------------------------------------------------

describe("gitsign provider", () => {
  it("isAvailable wires through commandExists", async () => {
    commandExistsMock.mockResolvedValueOnce(true);
    await expect(new GitsignProvider().isAvailable()).resolves.toBe(true);
    commandExistsMock.mockResolvedValueOnce(false);
    await expect(new GitsignProvider().isAvailable()).resolves.toBe(false);
  });

  it("listOutdated returns [] on failure", async () => {
    runMock.mockResolvedValueOnce(mkRun("", true));
    await expect(new GitsignProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when current cannot be parsed", async () => {
    runMock.mockResolvedValueOnce(mkRun("nope"));
    await expect(new GitsignProvider().listOutdated()).resolves.toEqual([]);
  });

  it("parses via GitVersion line", async () => {
    runMock.mockResolvedValueOnce(mkRun("GitVersion:    v0.12.0\nGitCommit: abc"));
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("0.13.0");
    detectInstallSourceMock.mockResolvedValueOnce("scoop");
    describeSourceMock.mockReturnValueOnce("via scoop");
    const rows = await new GitsignProvider().listOutdated();
    expect(rows[0]).toMatchObject({ id: "gitsign", current: "0.12.0", latest: "0.13.0" });
  });

  it("falls back to `version vX.Y.Z` line", async () => {
    runMock.mockResolvedValueOnce(mkRun("gitsign version v0.12.0\nBuild: ..."));
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("0.13.0");
    detectInstallSourceMock.mockResolvedValueOnce("manual");
    describeSourceMock.mockReturnValueOnce("manuel");
    const rows = await new GitsignProvider().listOutdated();
    expect(rows[0]).toMatchObject({ current: "0.12.0", latest: "0.13.0", manual: true });
  });

  it("returns [] when latest is null", async () => {
    runMock.mockResolvedValueOnce(mkRun("gitsign version v0.12.0"));
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce(null);
    await expect(new GitsignProvider().listOutdated()).resolves.toEqual([]);
  });

  it("returns [] when current == latest", async () => {
    runMock.mockResolvedValueOnce(mkRun("gitsign version v0.12.0"));
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("0.12.0");
    await expect(new GitsignProvider().listOutdated()).resolves.toEqual([]);
  });

  it("update delegates with scoop id", async () => {
    delegateUpdateMock.mockResolvedValueOnce({ id: "gitsign", success: true });
    await new GitsignProvider().update("gitsign");
    const arg = delegateUpdateMock.mock.calls[0]![0];
    expect(arg.binary).toBe("gitsign");
    expect(arg.packageIds).toEqual({ scoop: "gitsign", brew: "gitsign" });
  });

  it("updateAll empty returns []", async () => {
    await expect(new GitsignProvider().updateAll([])).resolves.toEqual([]);
  });

  it("updateAll non-empty delegates once", async () => {
    delegateUpdateMock.mockResolvedValueOnce({ id: "gitsign", success: false });
    const res = await new GitsignProvider().updateAll([{ id: "gitsign" } as never]);
    expect(res).toEqual([{ id: "gitsign", success: false }]);
  });
});

// ---------------------------------------------------------------------------
// nuclei / nuclei-templates / pdtm — share the "failed && !stdout && !stderr"
// shape and self-update via runInherit.
// ---------------------------------------------------------------------------

describe("nuclei provider", () => {
  it("isAvailable returns commandExists result", async () => {
    commandExistsMock.mockResolvedValueOnce(true);
    await expect(new NucleiProvider().isAvailable()).resolves.toBe(true);
    commandExistsMock.mockResolvedValueOnce(false);
    await expect(new NucleiProvider().isAvailable()).resolves.toBe(false);
  });

  it("listOutdated returns [] when failed AND no output", async () => {
    runMock.mockResolvedValueOnce(mkRun("", true, ""));
    await expect(new NucleiProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated proceeds when failed but stderr has content", async () => {
    runMock.mockResolvedValueOnce(
      mkRun("", true, "Nuclei Engine Version: v3.2.9\n"),
    );
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("3.3.0");
    const rows = await new NucleiProvider().listOutdated();
    expect(rows).toEqual([
      { id: "nuclei", name: "Nuclei", current: "3.2.9", latest: "3.3.0" },
    ]);
  });

  it("listOutdated returns [] when version line is absent", async () => {
    runMock.mockResolvedValueOnce(mkRun("no version here\n"));
    await expect(new NucleiProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when latest is null", async () => {
    runMock.mockResolvedValueOnce(mkRun("Nuclei Engine Version: v3.2.9\n"));
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce(null);
    await expect(new NucleiProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when current == latest", async () => {
    runMock.mockResolvedValueOnce(mkRun("Nuclei Engine Version: v3.2.9\n"));
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("3.2.9");
    await expect(new NucleiProvider().listOutdated()).resolves.toEqual([]);
  });

  it("update runs `nuclei -update` and returns success on exit 0", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    await expect(new NucleiProvider().update("nuclei")).resolves.toEqual({
      id: "nuclei",
      success: true,
    });
    expect(runInheritMock).toHaveBeenCalledWith("nuclei", ["-update"]);
  });

  it("update returns failure when self-update fails", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun("", true));
    await expect(new NucleiProvider().update("nuclei")).resolves.toEqual({
      id: "nuclei",
      success: false,
    });
  });

  it("updateAll empty short-circuits", async () => {
    await expect(new NucleiProvider().updateAll([])).resolves.toEqual([]);
    expect(runInheritMock).not.toHaveBeenCalled();
  });

  it("updateAll non-empty runs update once", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new NucleiProvider().updateAll([{ id: "nuclei" } as never]);
    expect(res).toEqual([{ id: "nuclei", success: true }]);
  });
});

describe("nuclei-templates provider", () => {
  it("isAvailable depends on nuclei binary", async () => {
    commandExistsMock.mockResolvedValueOnce(true);
    await expect(new NucleiTemplatesProvider().isAvailable()).resolves.toBe(true);
    expect(commandExistsMock).toHaveBeenCalledWith("nuclei");
  });

  it("listOutdated returns [] when failed and no output", async () => {
    runMock.mockResolvedValueOnce(mkRun("", true, ""));
    await expect(new NucleiTemplatesProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when templates version line missing", async () => {
    runMock.mockResolvedValueOnce(mkRun("Nuclei Engine Version: v3.2.9\n"));
    await expect(new NucleiTemplatesProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated parses templates version (mixed stdout+stderr)", async () => {
    runMock.mockResolvedValueOnce(
      mkRun(
        "Nuclei Engine Version: v3.2.9\n",
        false,
        "Nuclei Templates Version: v9.8.0\n",
      ),
    );
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("9.9.0");
    const rows = await new NucleiTemplatesProvider().listOutdated();
    expect(rows).toEqual([
      {
        id: "nuclei-templates",
        name: "Nuclei templates",
        current: "9.8.0",
        latest: "9.9.0",
      },
    ]);
  });

  it("listOutdated returns [] when latest is null", async () => {
    runMock.mockResolvedValueOnce(mkRun("Nuclei Templates Version: v9.8.0\n"));
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce(null);
    await expect(new NucleiTemplatesProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when current == latest", async () => {
    runMock.mockResolvedValueOnce(mkRun("Nuclei Templates Version: v9.8.0\n"));
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("9.8.0");
    await expect(new NucleiTemplatesProvider().listOutdated()).resolves.toEqual([]);
  });

  it("update runs `nuclei -update-templates`", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    await expect(
      new NucleiTemplatesProvider().update("nuclei-templates"),
    ).resolves.toEqual({ id: "nuclei-templates", success: true });
    expect(runInheritMock).toHaveBeenCalledWith("nuclei", ["-update-templates"]);
  });

  it("update returns failure on exit != 0", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun("", true));
    await expect(
      new NucleiTemplatesProvider().update("nuclei-templates"),
    ).resolves.toEqual({ id: "nuclei-templates", success: false });
  });

  it("updateAll empty short-circuits", async () => {
    await expect(new NucleiTemplatesProvider().updateAll([])).resolves.toEqual([]);
  });

  it("updateAll non-empty runs once", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new NucleiTemplatesProvider().updateAll([
      { id: "nuclei-templates" } as never,
    ]);
    expect(res).toEqual([{ id: "nuclei-templates", success: true }]);
  });
});

describe("pdtm provider", () => {
  it("isAvailable wires through commandExists", async () => {
    commandExistsMock.mockResolvedValueOnce(true);
    await expect(new PdtmProvider().isAvailable()).resolves.toBe(true);
    commandExistsMock.mockResolvedValueOnce(false);
    await expect(new PdtmProvider().isAvailable()).resolves.toBe(false);
  });

  it("listOutdated returns [] when failed and no output", async () => {
    runMock.mockResolvedValueOnce(mkRun("", true, ""));
    await expect(new PdtmProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when version line is absent", async () => {
    runMock.mockResolvedValueOnce(mkRun("totally unrelated"));
    await expect(new PdtmProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when latest is null", async () => {
    runMock.mockResolvedValueOnce(mkRun("Current Version: v0.0.9"));
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce(null);
    await expect(new PdtmProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when current == latest", async () => {
    runMock.mockResolvedValueOnce(mkRun("Current Version: v0.0.9"));
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("0.0.9");
    await expect(new PdtmProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated emits a row when versions differ (stderr fallback)", async () => {
    runMock.mockResolvedValueOnce(
      mkRun("", false, "Current Version: v0.0.9\n"),
    );
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("0.1.0");
    const rows = await new PdtmProvider().listOutdated();
    expect(rows).toEqual([
      { id: "pdtm", name: "pdtm", current: "0.0.9", latest: "0.1.0" },
    ]);
  });

  it("update aborts when self-update (`-up`) fails", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun("", true));
    const res = await new PdtmProvider().update("pdtm");
    expect(res).toEqual({ id: "pdtm", success: false });
    expect(runInheritMock).toHaveBeenCalledTimes(1);
    expect(runInheritMock).toHaveBeenCalledWith("pdtm", ["-up"]);
  });

  it("update chains `-up` then `-ua` and returns success", async () => {
    runInheritMock
      .mockResolvedValueOnce(mkRun(""))
      .mockResolvedValueOnce(mkRun(""));
    const res = await new PdtmProvider().update("pdtm");
    expect(res).toEqual({ id: "pdtm", success: true });
    expect(runInheritMock).toHaveBeenNthCalledWith(1, "pdtm", ["-up"]);
    expect(runInheritMock).toHaveBeenNthCalledWith(2, "pdtm", ["-ua"]);
  });

  it("update returns failure when `-ua` fails after `-up` succeeded", async () => {
    runInheritMock
      .mockResolvedValueOnce(mkRun(""))
      .mockResolvedValueOnce(mkRun("", true));
    const res = await new PdtmProvider().update("pdtm");
    expect(res).toEqual({ id: "pdtm", success: false });
  });

  it("updateAll empty short-circuits", async () => {
    await expect(new PdtmProvider().updateAll([])).resolves.toEqual([]);
  });

  it("updateAll non-empty triggers update", async () => {
    runInheritMock
      .mockResolvedValueOnce(mkRun(""))
      .mockResolvedValueOnce(mkRun(""));
    const res = await new PdtmProvider().updateAll([{ id: "pdtm" } as never]);
    expect(res).toEqual([{ id: "pdtm", success: true }]);
  });
});

// ---------------------------------------------------------------------------
// semgrep — PyPI fetch + pip self-update
// ---------------------------------------------------------------------------

describe("semgrep provider", () => {
  it("isAvailable returns commandExists result", async () => {
    commandExistsMock.mockResolvedValueOnce(true);
    await expect(new SemgrepProvider().isAvailable()).resolves.toBe(true);
    commandExistsMock.mockResolvedValueOnce(false);
    await expect(new SemgrepProvider().isAvailable()).resolves.toBe(false);
  });

  it("listOutdated returns [] when version probe fails", async () => {
    runMock.mockResolvedValueOnce(mkRun("", true));
    await expect(new SemgrepProvider().listOutdated()).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("listOutdated returns [] when output has no version", async () => {
    runMock.mockResolvedValueOnce(mkRun("not a version"));
    await expect(new SemgrepProvider().listOutdated()).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("listOutdated returns [] when fetch !ok", async () => {
    runMock.mockResolvedValueOnce(mkRun("1.79.0"));
    fetchMock.mockResolvedValueOnce(jsonResponse({}, false));
    await expect(new SemgrepProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when pypi version is missing", async () => {
    runMock.mockResolvedValueOnce(mkRun("1.79.0"));
    fetchMock.mockResolvedValueOnce(jsonResponse({ info: {} }));
    await expect(new SemgrepProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when fetch throws", async () => {
    runMock.mockResolvedValueOnce(mkRun("1.79.0"));
    fetchMock.mockRejectedValueOnce(new Error("boom"));
    await expect(new SemgrepProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when current == latest", async () => {
    runMock.mockResolvedValueOnce(mkRun("1.79.0"));
    fetchMock.mockResolvedValueOnce(jsonResponse({ info: { version: "1.79.0" } }));
    await expect(new SemgrepProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns a row when versions differ", async () => {
    runMock.mockResolvedValueOnce(mkRun("1.79.0\n"));
    fetchMock.mockResolvedValueOnce(jsonResponse({ info: { version: "1.80.0" } }));
    const rows = await new SemgrepProvider().listOutdated();
    expect(rows).toEqual([
      { id: "semgrep", name: "Semgrep", current: "1.79.0", latest: "1.80.0" },
    ]);
  });

  it("update pilots pip via the python that owns semgrep on PATH (Windows)", async () => {
    if (process.platform !== "win32") return; // path layout differs
    whichFirstMock.mockResolvedValueOnce("F:\\Programme\\Python\\Scripts\\semgrep.exe");
    existsSyncMock.mockImplementation(
      (p: unknown) => p === "F:\\Programme\\Python\\python.exe",
    );
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    await expect(new SemgrepProvider().update("semgrep")).resolves.toEqual({
      id: "semgrep",
      success: true,
    });
    expect(runInheritMock).toHaveBeenCalledWith("F:\\Programme\\Python\\python.exe", [
      "-m",
      "pip",
      "install",
      "--upgrade",
      "--disable-pip-version-check",
      "semgrep",
    ]);
  });

  it("update marks skipped when the host python can't be resolved", async () => {
    whichFirstMock.mockResolvedValueOnce(null);
    const res = await new SemgrepProvider().update("semgrep");
    expect(res).toMatchObject({ id: "semgrep", success: false, skipped: true });
    expect(res.message).toMatch(/Python/i);
    expect(runInheritMock).not.toHaveBeenCalled();
  });

  it("update marks skipped when the companion python is missing on disk", async () => {
    whichFirstMock.mockResolvedValueOnce("/usr/local/bin/semgrep");
    existsSyncMock.mockReturnValue(false);
    const res = await new SemgrepProvider().update("semgrep");
    expect(res).toMatchObject({ id: "semgrep", success: false, skipped: true });
    expect(runInheritMock).not.toHaveBeenCalled();
  });

  it("update propagates failure when pip exits non-zero", async () => {
    if (process.platform !== "win32") return;
    whichFirstMock.mockResolvedValueOnce("F:\\Programme\\Python\\Scripts\\semgrep.exe");
    existsSyncMock.mockReturnValue(true);
    runInheritMock.mockResolvedValueOnce(mkRun("", true));
    const res = await new SemgrepProvider().update("semgrep");
    expect(res).toEqual({ id: "semgrep", success: false });
  });

  it("updateAll empty short-circuits", async () => {
    await expect(new SemgrepProvider().updateAll([])).resolves.toEqual([]);
  });

  it("updateAll non-empty runs update once", async () => {
    if (process.platform !== "win32") return;
    whichFirstMock.mockResolvedValueOnce("F:\\Programme\\Python\\Scripts\\semgrep.exe");
    existsSyncMock.mockReturnValue(true);
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new SemgrepProvider().updateAll([{ id: "semgrep" } as never]);
    expect(res).toEqual([{ id: "semgrep", success: true }]);
  });
});
