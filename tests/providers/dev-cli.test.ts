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

import { DeltaProvider } from "../../src/providers/dev-cli/delta.js";
import { GhExtensionsProvider } from "../../src/providers/dev-cli/gh-extensions.js";
import { GlabProvider } from "../../src/providers/dev-cli/glab.js";
import { JujutsuProvider } from "../../src/providers/dev-cli/jj.js";
import { LazydockerProvider } from "../../src/providers/dev-cli/lazydocker.js";
import { LazygitProvider } from "../../src/providers/dev-cli/lazygit.js";
import { TeaProvider } from "../../src/providers/dev-cli/tea.js";

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
// Shared spec for the GH-release-backed delegate-update providers
// ---------------------------------------------------------------------------
interface GhSpec {
  name: string;
  Ctor: new () => {
    isAvailable(): Promise<boolean>;
    listOutdated(): Promise<
      Array<{
        id: string;
        current: string;
        latest: string;
        note?: string;
        manual?: boolean;
      }>
    >;
    update(id: string): Promise<{ id: string; success: boolean }>;
    updateAll(
      pkgs: Array<{ id: string; name: string; current: string; latest: string }>,
    ): Promise<Array<{ id: string; success: boolean }>>;
  };
  binary: string;
  repo: string;
  id: string;
  versionStdout: (v: string) => string;
  unparsable: string;
  scoopId?: string;
  chocoId?: string;
  wingetId?: string;
}

const ghSpecs: GhSpec[] = [
  {
    name: "delta",
    Ctor: DeltaProvider,
    binary: "delta",
    repo: "dandavison/delta",
    id: "delta",
    versionStdout: (v) => `delta ${v}`,
    unparsable: "weird output",
    scoopId: "delta",
    chocoId: "delta",
    wingetId: "dandavison.delta",
  },
  {
    name: "jj",
    Ctor: JujutsuProvider,
    binary: "jj",
    repo: "jj-vcs/jj",
    id: "jj",
    versionStdout: (v) => `jj ${v}`,
    unparsable: "no version line",
    scoopId: "jj",
    wingetId: "martinvonz.jj",
  },
  {
    name: "lazydocker",
    Ctor: LazydockerProvider,
    binary: "lazydocker",
    repo: "jesseduffield/lazydocker",
    id: "lazydocker",
    versionStdout: (v) => `Version: ${v}\nDate: 2024-01-01`,
    unparsable: "no version",
    scoopId: "lazydocker",
    chocoId: "lazydocker",
    wingetId: "JesseDuffield.Lazydocker",
  },
  {
    name: "lazygit",
    Ctor: LazygitProvider,
    binary: "lazygit",
    repo: "jesseduffield/lazygit",
    id: "lazygit",
    versionStdout: (v) => `commit=abc, build date=x, version=${v}, os=windows`,
    unparsable: "no relevant key",
    scoopId: "lazygit",
    chocoId: "lazygit",
    wingetId: "JesseDuffield.lazygit",
  },
];

for (const spec of ghSpecs) {
  describe(`${spec.name} provider`, () => {
    it("isAvailable returns true when binary is present", async () => {
      commandExistsMock.mockResolvedValueOnce(true);
      await expect(new spec.Ctor().isAvailable()).resolves.toBe(true);
      expect(commandExistsMock).toHaveBeenCalledWith(spec.binary);
    });

    it("isAvailable returns false otherwise", async () => {
      commandExistsMock.mockResolvedValueOnce(false);
      await expect(new spec.Ctor().isAvailable()).resolves.toBe(false);
    });

    it("listOutdated returns [] when version probe fails", async () => {
      runMock.mockResolvedValueOnce(mkRun("", true));
      await expect(new spec.Ctor().listOutdated()).resolves.toEqual([]);
      expect(fetchGitHubReleaseLatestMock).not.toHaveBeenCalled();
    });

    it("listOutdated returns [] when version can't be parsed", async () => {
      runMock.mockResolvedValueOnce(mkRun(spec.unparsable));
      await expect(new spec.Ctor().listOutdated()).resolves.toEqual([]);
      expect(fetchGitHubReleaseLatestMock).not.toHaveBeenCalled();
    });

    it("listOutdated returns [] when GH release fetch is null", async () => {
      runMock.mockResolvedValueOnce(mkRun(spec.versionStdout("1.0.0")));
      fetchGitHubReleaseLatestMock.mockResolvedValueOnce(null);
      await expect(new spec.Ctor().listOutdated()).resolves.toEqual([]);
      expect(fetchGitHubReleaseLatestMock).toHaveBeenCalledWith(spec.repo);
    });

    it("listOutdated returns [] when current == latest", async () => {
      runMock.mockResolvedValueOnce(mkRun(spec.versionStdout("1.2.3")));
      fetchGitHubReleaseLatestMock.mockResolvedValueOnce("1.2.3");
      await expect(new spec.Ctor().listOutdated()).resolves.toEqual([]);
    });

    it("listOutdated returns a row when versions differ", async () => {
      runMock.mockResolvedValueOnce(mkRun(spec.versionStdout("1.0.0")));
      fetchGitHubReleaseLatestMock.mockResolvedValueOnce("1.2.3");
      detectInstallSourceMock.mockResolvedValueOnce("scoop");
      describeSourceMock.mockReturnValueOnce("via scoop");

      const rows = await new spec.Ctor().listOutdated();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        id: spec.id,
        current: "1.0.0",
        latest: "1.2.3",
        note: "via scoop",
      });
      expect(rows[0]).not.toHaveProperty("manual");
      expect(detectInstallSourceMock).toHaveBeenCalledWith(spec.binary);
    });

    it("listOutdated flags manual installs", async () => {
      runMock.mockResolvedValueOnce(mkRun(spec.versionStdout("1.0.0")));
      fetchGitHubReleaseLatestMock.mockResolvedValueOnce("1.2.3");
      detectInstallSourceMock.mockResolvedValueOnce("manual");
      describeSourceMock.mockReturnValueOnce("manuel");

      const rows = await new spec.Ctor().listOutdated();
      expect(rows[0]).toMatchObject({ manual: true, note: "manuel" });
    });

    it("update delegates with the expected packageIds", async () => {
      delegateUpdateMock.mockResolvedValueOnce({ id: spec.id, success: true });
      const res = await new spec.Ctor().update(spec.id);
      expect(res).toEqual({ id: spec.id, success: true });
      const arg = delegateUpdateMock.mock.calls[0]![0] as {
        id: string;
        binary: string;
        packageIds: { scoop?: string; choco?: string; winget?: string };
        manualMessage: string;
      };
      expect(arg.id).toBe(spec.id);
      expect(arg.binary).toBe(spec.binary);
      if (spec.scoopId) expect(arg.packageIds.scoop).toBe(spec.scoopId);
      if (spec.chocoId) expect(arg.packageIds.choco).toBe(spec.chocoId);
      if (spec.wingetId) expect(arg.packageIds.winget).toBe(spec.wingetId);
      expect(arg.manualMessage).toEqual(expect.any(String));
    });

    it("updateAll returns [] on empty input", async () => {
      await expect(new spec.Ctor().updateAll([])).resolves.toEqual([]);
      expect(delegateUpdateMock).not.toHaveBeenCalled();
    });

    it("updateAll delegates once when packages exist", async () => {
      delegateUpdateMock.mockResolvedValueOnce({ id: spec.id, success: false });
      const res = await new spec.Ctor().updateAll([
        { id: spec.id, name: spec.id, current: "1.0.0", latest: "1.2.3" },
      ]);
      expect(res).toEqual([{ id: spec.id, success: false }]);
      expect(delegateUpdateMock).toHaveBeenCalledTimes(1);
    });
  });
}

// ---------------------------------------------------------------------------
// gh-extensions: tabular parsing + per-extension gh-api fan-out
// ---------------------------------------------------------------------------
describe("gh-extensions provider", () => {
  it("isAvailable wires to commandExists('gh')", async () => {
    commandExistsMock.mockResolvedValueOnce(true);
    await expect(new GhExtensionsProvider().isAvailable()).resolves.toBe(true);
    expect(commandExistsMock).toHaveBeenCalledWith("gh");
    commandExistsMock.mockResolvedValueOnce(false);
    await expect(new GhExtensionsProvider().isAvailable()).resolves.toBe(false);
  });

  it("listOutdated returns [] when no extensions are installed", async () => {
    runMock.mockResolvedValueOnce(mkRun(""));
    await expect(new GhExtensionsProvider().listOutdated()).resolves.toEqual([]);
    // Should not invoke any per-extension probe
    expect(runMock).toHaveBeenCalledTimes(1);
  });

  it("listOutdated skips header rows, dash separator and malformed lines", async () => {
    // Header, dashes, plus a malformed line (only one column / bad repo)
    const stdout = [
      "NAME       REPO              VERSION",
      "----       ----              -------",
      "soloname",
      "gh-foo     not-a-repo-token  v1.0.0",
    ].join("\n");
    runMock.mockResolvedValueOnce(mkRun(stdout));
    const rows = await new GhExtensionsProvider().listOutdated();
    expect(rows).toEqual([]);
    expect(runMock).toHaveBeenCalledTimes(1);
  });

  it("listOutdated skips an extension when its latest fetch fails", async () => {
    const stdout = [
      "NAME      REPO              VERSION",
      "gh-foo    owner/foo         v1.0.0",
    ].join("\n");
    runMock
      .mockResolvedValueOnce(mkRun(stdout))
      // failed gh api -> null
      .mockResolvedValueOnce(mkRun("", true));
    await expect(new GhExtensionsProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated skips when latest is the empty tag", async () => {
    const stdout = [
      "NAME      REPO              VERSION",
      "gh-foo    owner/foo         v1.0.0",
    ].join("\n");
    runMock
      .mockResolvedValueOnce(mkRun(stdout))
      // gh api succeeded but produced empty tag
      .mockResolvedValueOnce(mkRun("   "));
    await expect(new GhExtensionsProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated skips when normalized current == normalized latest", async () => {
    // normalizeTag strips a leading lowercase 'v' and lowercases — so
    // 'v1.2.3' (current) and '1.2.3' (latest) collapse to the same key.
    const stdout = [
      "NAME      REPO              VERSION",
      "gh-foo    owner/foo         v1.2.3",
    ].join("\n");
    runMock
      .mockResolvedValueOnce(mkRun(stdout))
      .mockResolvedValueOnce(mkRun("1.2.3\n"));
    await expect(new GhExtensionsProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated handles leading '* ' marker and missing version column", async () => {
    const stdout = [
      "NAME      REPO              VERSION",
      "* gh-foo  owner/foo         v1.0.0",
      "gh-bar    owner/bar",
    ].join("\n");
    runMock
      .mockResolvedValueOnce(mkRun(stdout))
      // both extensions probed; both have a newer release
      .mockResolvedValueOnce(mkRun("v1.2.3"))
      .mockResolvedValueOnce(mkRun("v2.0.0"));
    const rows = await new GhExtensionsProvider().listOutdated();
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.get("gh-foo")).toEqual({
      id: "gh-foo",
      name: "gh-foo",
      current: "v1.0.0",
      latest: "v1.2.3",
    });
    expect(byId.get("gh-bar")).toEqual({
      id: "gh-bar",
      name: "gh-bar",
      current: "?",
      latest: "v2.0.0",
    });
  });

  it("update runs `gh extension upgrade <id>` and propagates success", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new GhExtensionsProvider().update("gh-foo");
    expect(res).toEqual({ id: "gh-foo", success: true });
    expect(runInheritMock).toHaveBeenCalledWith("gh", [
      "extension",
      "upgrade",
      "gh-foo",
    ]);
  });

  it("update propagates failure", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun("", true));
    const res = await new GhExtensionsProvider().update("gh-foo");
    expect(res).toEqual({ id: "gh-foo", success: false });
  });

  it("updateAll returns [] when input is empty (no upgrade --all invoked)", async () => {
    await expect(new GhExtensionsProvider().updateAll([])).resolves.toEqual([]);
    expect(runInheritMock).not.toHaveBeenCalled();
  });

  it("updateAll runs `gh extension upgrade --all` once and maps success per package", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new GhExtensionsProvider().updateAll([
      { id: "gh-foo", name: "gh-foo", current: "1", latest: "2" },
      { id: "gh-bar", name: "gh-bar", current: "1", latest: "2" },
    ]);
    expect(res).toEqual([
      { id: "gh-foo", success: true },
      { id: "gh-bar", success: true },
    ]);
    expect(runInheritMock).toHaveBeenCalledExactlyOnceWith("gh", [
      "extension",
      "upgrade",
      "--all",
    ]);
  });

  it("updateAll propagates a global failure to every outcome", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun("", true));
    const res = await new GhExtensionsProvider().updateAll([
      { id: "gh-foo", name: "gh-foo", current: "1", latest: "2" },
    ]);
    expect(res).toEqual([{ id: "gh-foo", success: false }]);
  });
});

// ---------------------------------------------------------------------------
// glab: own update binary, no delegate
// ---------------------------------------------------------------------------
describe("glab provider", () => {
  it("isAvailable wires to commandExists('glab')", async () => {
    commandExistsMock.mockResolvedValueOnce(true);
    await expect(new GlabProvider().isAvailable()).resolves.toBe(true);
    commandExistsMock.mockResolvedValueOnce(false);
    await expect(new GlabProvider().isAvailable()).resolves.toBe(false);
  });

  it("listOutdated returns [] when probe fails", async () => {
    runMock.mockResolvedValueOnce(mkRun("", true));
    await expect(new GlabProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when version can't be parsed", async () => {
    runMock.mockResolvedValueOnce(mkRun("nothing here"));
    await expect(new GlabProvider().listOutdated()).resolves.toEqual([]);
    expect(fetchGitHubReleaseLatestMock).not.toHaveBeenCalled();
  });

  it("listOutdated returns [] when GH fetch is null", async () => {
    runMock.mockResolvedValueOnce(mkRun("glab version 1.40.0"));
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce(null);
    await expect(new GlabProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when current == latest", async () => {
    runMock.mockResolvedValueOnce(mkRun("glab version 1.40.0"));
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("1.40.0");
    await expect(new GlabProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns a row when versions differ", async () => {
    runMock.mockResolvedValueOnce(mkRun("glab version 1.40.0 (build)"));
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("1.42.0");
    const rows = await new GlabProvider().listOutdated();
    expect(rows).toEqual([
      { id: "glab", name: "GitLab CLI", current: "1.40.0", latest: "1.42.0" },
    ]);
  });

  it("update runs `glab update` and propagates success/failure", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    let res = await new GlabProvider().update("glab");
    expect(res).toEqual({ id: "glab", success: true });
    expect(runInheritMock).toHaveBeenCalledWith("glab", ["update"]);
    runInheritMock.mockResolvedValueOnce(mkRun("", true));
    res = await new GlabProvider().update("glab");
    expect(res).toEqual({ id: "glab", success: false });
  });

  it("updateAll returns [] on empty input", async () => {
    await expect(new GlabProvider().updateAll([])).resolves.toEqual([]);
    expect(runInheritMock).not.toHaveBeenCalled();
  });

  it("updateAll delegates once when packages present", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new GlabProvider().updateAll([
      { id: "glab", name: "GitLab CLI", current: "1.40.0", latest: "1.42.0" },
    ]);
    expect(res).toEqual([{ id: "glab", success: true }]);
  });
});

// ---------------------------------------------------------------------------
// tea: Gitea release via global fetch
// ---------------------------------------------------------------------------
describe("tea provider", () => {
  it("isAvailable wires to commandExists('tea')", async () => {
    commandExistsMock.mockResolvedValueOnce(true);
    await expect(new TeaProvider().isAvailable()).resolves.toBe(true);
    commandExistsMock.mockResolvedValueOnce(false);
    await expect(new TeaProvider().isAvailable()).resolves.toBe(false);
  });

  it("listOutdated returns [] when version probe fails", async () => {
    runMock.mockResolvedValueOnce(mkRun("", true));
    await expect(new TeaProvider().listOutdated()).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("listOutdated returns [] when version can't be parsed", async () => {
    runMock.mockResolvedValueOnce(mkRun("garbage"));
    await expect(new TeaProvider().listOutdated()).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("listOutdated returns [] when Gitea API responds !ok", async () => {
    runMock.mockResolvedValueOnce(mkRun("Tea version 0.9.0"));
    fetchMock.mockResolvedValueOnce(jsonResponse({}, false));
    await expect(new TeaProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when fetch throws", async () => {
    runMock.mockResolvedValueOnce(mkRun("Tea version 0.9.0"));
    fetchMock.mockRejectedValueOnce(new Error("net down"));
    await expect(new TeaProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when API returns no tag_name", async () => {
    runMock.mockResolvedValueOnce(mkRun("Tea version 0.9.0"));
    fetchMock.mockResolvedValueOnce(jsonResponse({}));
    await expect(new TeaProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when current == latest (with leading v stripped)", async () => {
    runMock.mockResolvedValueOnce(mkRun("Tea version 0.9.2"));
    fetchMock.mockResolvedValueOnce(jsonResponse({ tag_name: "v0.9.2" }));
    await expect(new TeaProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns a row when versions differ", async () => {
    runMock.mockResolvedValueOnce(mkRun("Tea version 0.9.2"));
    fetchMock.mockResolvedValueOnce(jsonResponse({ tag_name: "v0.10.0" }));
    detectInstallSourceMock.mockResolvedValueOnce("scoop");
    describeSourceMock.mockReturnValueOnce("via scoop");

    const rows = await new TeaProvider().listOutdated();
    expect(rows).toEqual([
      {
        id: "tea",
        name: "Gitea CLI",
        current: "0.9.2",
        latest: "0.10.0",
        note: "via scoop",
      },
    ]);
    expect(detectInstallSourceMock).toHaveBeenCalledWith("tea");
  });

  it("listOutdated flags manual installs", async () => {
    runMock.mockResolvedValueOnce(mkRun("Tea version 0.9.2"));
    fetchMock.mockResolvedValueOnce(jsonResponse({ tag_name: "v0.10.0" }));
    detectInstallSourceMock.mockResolvedValueOnce("manual");
    describeSourceMock.mockReturnValueOnce("manuel");
    const rows = await new TeaProvider().listOutdated();
    expect(rows[0]).toMatchObject({ manual: true, note: "manuel" });
  });

  it("update delegates with scoop:tea", async () => {
    delegateUpdateMock.mockResolvedValueOnce({ id: "tea", success: true });
    await new TeaProvider().update("tea");
    const arg = delegateUpdateMock.mock.calls[0]![0] as {
      id: string;
      binary: string;
      packageIds: { scoop?: string };
    };
    expect(arg).toMatchObject({
      id: "tea",
      binary: "tea",
      packageIds: { scoop: "tea" },
    });
  });

  it("updateAll returns [] on empty input", async () => {
    await expect(new TeaProvider().updateAll([])).resolves.toEqual([]);
    expect(delegateUpdateMock).not.toHaveBeenCalled();
  });

  it("updateAll delegates once when packages exist", async () => {
    delegateUpdateMock.mockResolvedValueOnce({ id: "tea", success: false });
    const res = await new TeaProvider().updateAll([
      { id: "tea", name: "Gitea CLI", current: "0.9.2", latest: "0.10.0" },
    ]);
    expect(res).toEqual([{ id: "tea", success: false }]);
  });
});
