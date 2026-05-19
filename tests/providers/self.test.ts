import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { commandExistsMock, runMock, runInheritMock, isElevatedMock, whichFirstMock } =
  vi.hoisted(() => ({
    commandExistsMock: vi.fn(),
    runMock: vi.fn(),
    runInheritMock: vi.fn(),
    isElevatedMock: vi.fn(),
    whichFirstMock: vi.fn(),
  }));

vi.mock("../../src/core/runner.js", () => ({
  commandExists: commandExistsMock,
  run: runMock,
  runInherit: runInheritMock,
  isElevated: isElevatedMock,
  whichFirst: whichFirstMock,
}));

const { isCorepackShimMock } = vi.hoisted(() => ({
  isCorepackShimMock: vi.fn(),
}));

vi.mock("../../src/core/corepack-ownership.js", () => ({
  isCorepackShim: isCorepackShimMock,
}));

const { fetchGitHubReleaseLatestMock } = vi.hoisted(() => ({
  fetchGitHubReleaseLatestMock: vi.fn(),
}));

vi.mock("../../src/core/gh-releases.js", async () => {
  const actual = await vi.importActual<typeof import("../../src/core/gh-releases.js")>(
    "../../src/core/gh-releases.js",
  );
  return {
    ...actual,
    fetchGitHubReleaseLatest: fetchGitHubReleaseLatestMock,
  };
});

const { delegateUpdateMock } = vi.hoisted(() => ({
  delegateUpdateMock: vi.fn(),
}));

vi.mock("../../src/core/install-source.js", () => ({
  delegateUpdate: delegateUpdateMock,
}));

import { SelfProvider } from "../../src/providers/self.js";

function mkRun(stdout: string, failed = false) {
  return { stdout, stderr: "", exitCode: failed ? 1 : 0, failed };
}

function jsonResponse(body: unknown, ok = true): Response {
  return {
    ok,
    json: async () => body,
  } as unknown as Response;
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  commandExistsMock.mockReset();
  runMock.mockReset();
  runInheritMock.mockReset();
  isElevatedMock.mockReset();
  whichFirstMock.mockReset();
  isCorepackShimMock.mockReset();
  fetchGitHubReleaseLatestMock.mockReset();
  delegateUpdateMock.mockReset();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SelfProvider.isAvailable", () => {
  it("returns true when at least one PM binary is on PATH", async () => {
    commandExistsMock.mockImplementation(async (bin: string) => bin === "npm");
    await expect(new SelfProvider().isAvailable()).resolves.toBe(true);
  });

  it("returns false when no tracked PM is on PATH", async () => {
    commandExistsMock.mockResolvedValue(false);
    await expect(new SelfProvider().isAvailable()).resolves.toBe(false);
  });
});

describe("SelfProvider.listOutdated", () => {
  it("emits a manual row for winget with the manualMessage as note", async () => {
    isCorepackShimMock.mockResolvedValue(false);
    commandExistsMock.mockImplementation(async (bin: string) => bin === "winget");
    runMock.mockImplementation(async (cmd: string) => {
      if (cmd === "winget") return mkRun("v1.6.0");
      return mkRun("", true);
    });
    fetchGitHubReleaseLatestMock.mockImplementation(async (repo: string) =>
      repo === "microsoft/winget-cli" ? "1.7.0" : null,
    );

    const pkgs = await new SelfProvider().listOutdated();
    expect(pkgs).toHaveLength(1);
    expect(pkgs[0]).toMatchObject({
      id: "winget",
      current: "1.6.0",
      latest: "1.7.0",
      manual: true,
    });
    expect(pkgs[0]?.note).toMatch(/Microsoft Store|winget-cli/);
  });

  it("emits a non-manual row when current != latest for npm", async () => {
    isCorepackShimMock.mockResolvedValue(false);
    commandExistsMock.mockImplementation(async (bin: string) => bin === "npm");
    runMock.mockImplementation(async (cmd: string) =>
      cmd === "npm" ? mkRun("10.0.0") : mkRun("", true),
    );
    fetchMock.mockResolvedValueOnce(jsonResponse({ version: "10.1.0" }));

    const pkgs = await new SelfProvider().listOutdated();
    expect(pkgs).toEqual([
      { id: "npm", name: "npm", current: "10.0.0", latest: "10.1.0" },
    ]);
    expect(pkgs[0]?.manual).toBeUndefined();
  });

  it("filters out pnpm/yarn when they are corepack-owned", async () => {
    isCorepackShimMock.mockImplementation(
      async (bin: string) => bin === "pnpm" || bin === "yarn",
    );
    commandExistsMock.mockImplementation(
      async (bin: string) => bin === "pnpm" || bin === "yarn",
    );
    runMock.mockResolvedValue(mkRun("1.0.0"));
    fetchMock.mockResolvedValue(jsonResponse({ version: "2.0.0" }));

    const pkgs = await new SelfProvider().listOutdated();
    expect(pkgs).toEqual([]);
    expect(runMock).not.toHaveBeenCalled();
  });

  it("includes pnpm when corepack does NOT own it", async () => {
    isCorepackShimMock.mockResolvedValue(false);
    commandExistsMock.mockImplementation(async (bin: string) => bin === "pnpm");
    runMock.mockImplementation(async (cmd: string) =>
      cmd === "pnpm" ? mkRun("9.0.0") : mkRun("", true),
    );
    fetchMock.mockResolvedValueOnce(jsonResponse({ version: "9.5.0" }));

    const pkgs = await new SelfProvider().listOutdated();
    expect(pkgs).toEqual([
      { id: "pnpm", name: "pnpm", current: "9.0.0", latest: "9.5.0" },
    ]);
  });

  it("skips a target whose binary is not on PATH", async () => {
    isCorepackShimMock.mockResolvedValue(false);
    commandExistsMock.mockResolvedValue(false);
    const pkgs = await new SelfProvider().listOutdated();
    expect(pkgs).toEqual([]);
    expect(runMock).not.toHaveBeenCalled();
  });

  it("skips a target when current() returns null (run failed/empty)", async () => {
    isCorepackShimMock.mockResolvedValue(false);
    commandExistsMock.mockImplementation(async (bin: string) => bin === "npm");
    runMock.mockResolvedValue(mkRun("", true));
    fetchMock.mockResolvedValue(jsonResponse({ version: "10.0.0" }));

    const pkgs = await new SelfProvider().listOutdated();
    expect(pkgs).toEqual([]);
  });

  it("skips a target when latest() returns null (fetch !ok)", async () => {
    isCorepackShimMock.mockResolvedValue(false);
    commandExistsMock.mockImplementation(async (bin: string) => bin === "npm");
    runMock.mockResolvedValue(mkRun("10.0.0"));
    fetchMock.mockResolvedValueOnce(jsonResponse({}, false));

    const pkgs = await new SelfProvider().listOutdated();
    expect(pkgs).toEqual([]);
  });

  it("skips a target when fetch throws (network error)", async () => {
    isCorepackShimMock.mockResolvedValue(false);
    commandExistsMock.mockImplementation(async (bin: string) => bin === "pip");
    runMock.mockResolvedValue(mkRun("pip 24.0 from somewhere"));
    fetchMock.mockRejectedValueOnce(new Error("ECONNRESET"));

    const pkgs = await new SelfProvider().listOutdated();
    expect(pkgs).toEqual([]);
  });

  it("skips a target when normalized current equals normalized latest", async () => {
    isCorepackShimMock.mockResolvedValue(false);
    commandExistsMock.mockImplementation(async (bin: string) => bin === "gh");
    runMock.mockImplementation(async (cmd: string) =>
      cmd === "gh" ? mkRun("gh version 2.55.0 (2024-01-01)") : mkRun("", true),
    );
    fetchGitHubReleaseLatestMock.mockResolvedValue("v2.55.0");

    const pkgs = await new SelfProvider().listOutdated();
    expect(pkgs).toEqual([]);
  });

  it("parses scoop --version using the 'Current Scoop version:' delimiter", async () => {
    isCorepackShimMock.mockResolvedValue(false);
    commandExistsMock.mockImplementation(async (bin: string) => bin === "scoop");
    runMock.mockImplementation(async (cmd: string) =>
      cmd === "scoop"
        ? mkRun("Current Scoop version:\nv0.4.0 - Released ...")
        : mkRun("", true),
    );
    fetchGitHubReleaseLatestMock.mockResolvedValue("0.5.0");

    const pkgs = await new SelfProvider().listOutdated();
    expect(pkgs).toEqual([
      { id: "scoop", name: "Scoop", current: "0.4.0", latest: "0.5.0" },
    ]);
  });
});

describe("SelfProvider.update", () => {
  it("returns 'Cible self inconnue' failure for an unknown id", async () => {
    const res = await new SelfProvider().update("does-not-exist");
    expect(res).toEqual({
      id: "does-not-exist",
      success: false,
      message: "Cible self inconnue",
    });
  });

  it("winget update is skipped + not successful", async () => {
    const res = await new SelfProvider().update("winget");
    expect(res).toMatchObject({ id: "winget", success: false, skipped: true });
    expect(res.message).toMatch(/Microsoft Store|téléchargement manuel/i);
    expect(runInheritMock).not.toHaveBeenCalled();
  });

  it("scoop update runs `scoop update` with shell:true", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new SelfProvider().update("scoop");
    expect(res).toEqual({ id: "scoop", success: true });
    expect(runInheritMock).toHaveBeenCalledWith("scoop", ["update"], { shell: true });
  });

  it("choco update returns skipped + French elevation message when not elevated", async () => {
    isElevatedMock.mockResolvedValueOnce(false);
    const res = await new SelfProvider().update("choco");
    expect(res).toMatchObject({ id: "choco", success: false, skipped: true });
    expect(res.message).toMatch(/terminal admin/i);
    expect(runInheritMock).not.toHaveBeenCalled();
  });

  it("choco update runs `choco upgrade chocolatey -y` when elevated", async () => {
    isElevatedMock.mockResolvedValueOnce(true);
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new SelfProvider().update("choco");
    expect(res).toEqual({ id: "choco", success: true });
    expect(runInheritMock).toHaveBeenCalledWith("choco", [
      "upgrade",
      "chocolatey",
      "-y",
    ]);
  });

  it("propagates failure from underlying runInherit (choco)", async () => {
    isElevatedMock.mockResolvedValueOnce(true);
    runInheritMock.mockResolvedValueOnce(mkRun("", true));
    const res = await new SelfProvider().update("choco");
    expect(res).toEqual({ id: "choco", success: false });
  });

  it("npm update runs `npm install -g npm@latest`", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new SelfProvider().update("npm");
    expect(res).toEqual({ id: "npm", success: true });
    expect(runInheritMock).toHaveBeenCalledWith("npm", [
      "install",
      "-g",
      "npm@latest",
    ]);
  });

  it("pnpm update reports success via before/after version delta", async () => {
    runMock
      .mockResolvedValueOnce(mkRun("9.0.0"))
      .mockResolvedValueOnce(mkRun("9.5.0"));
    runInheritMock.mockResolvedValueOnce(mkRun("", true));
    const res = await new SelfProvider().update("pnpm");
    expect(res).toEqual({ id: "pnpm", success: true });
    expect(runInheritMock).toHaveBeenCalledWith("pnpm", ["self-update"]);
  });

  it("pnpm update falls back to runInherit exit code when version is unchanged", async () => {
    runMock.mockResolvedValue(mkRun("9.0.0"));
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new SelfProvider().update("pnpm");
    expect(res).toEqual({ id: "pnpm", success: true });
  });

  it("pnpm update returns failure when version unchanged and runInherit failed", async () => {
    runMock.mockResolvedValue(mkRun("9.0.0"));
    runInheritMock.mockResolvedValueOnce(mkRun("", true));
    const res = await new SelfProvider().update("pnpm");
    expect(res).toEqual({ id: "pnpm", success: false });
  });

  it("yarn update prefers corepack when available", async () => {
    commandExistsMock.mockImplementation(async (bin: string) => bin === "corepack");
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new SelfProvider().update("yarn");
    expect(res).toEqual({ id: "yarn", success: true });
    expect(runInheritMock).toHaveBeenCalledWith("corepack", [
      "prepare",
      "yarn@stable",
      "--activate",
    ]);
  });

  it("yarn update falls back to `npm install -g yarn` without corepack", async () => {
    commandExistsMock.mockResolvedValue(false);
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new SelfProvider().update("yarn");
    expect(res).toEqual({ id: "yarn", success: true });
    expect(runInheritMock).toHaveBeenCalledWith("npm", ["install", "-g", "yarn"]);
  });

  it("pip update returns 'Python introuvable' when no launcher is available", async () => {
    whichFirstMock.mockResolvedValue(null);
    commandExistsMock.mockResolvedValue(false);
    const res = await new SelfProvider().update("pip");
    expect(res).toEqual({
      id: "pip",
      success: false,
      message: "Python introuvable dans le PATH",
    });
    expect(runInheritMock).not.toHaveBeenCalled();
  });

  it("pip update invokes `<py> -m pip install --user -U --disable-pip-version-check pip` when py exists", async () => {
    whichFirstMock.mockResolvedValue(null);
    commandExistsMock.mockImplementation(async (bin: string) => bin === "py");
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new SelfProvider().update("pip");
    expect(res).toEqual({ id: "pip", success: true });
    expect(runInheritMock).toHaveBeenCalledWith("py", [
      "-m",
      "pip",
      "install",
      "--user",
      "-U",
      "--disable-pip-version-check",
      "pip",
    ]);
  });

  it("pipx update runs `pipx upgrade pipx`", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new SelfProvider().update("pipx");
    expect(res).toEqual({ id: "pipx", success: true });
    expect(runInheritMock).toHaveBeenCalledWith("pipx", ["upgrade", "pipx"]);
  });

  it("gh update delegates to delegateUpdate with winget/scoop/choco package ids", async () => {
    const expected = { id: "gh", success: true };
    delegateUpdateMock.mockResolvedValueOnce(expected);
    const res = await new SelfProvider().update("gh");
    expect(res).toBe(expected);
    expect(delegateUpdateMock).toHaveBeenCalledTimes(1);
    const arg = delegateUpdateMock.mock.calls[0]![0];
    expect(arg).toMatchObject({
      id: "gh",
      binary: "gh",
      packageIds: { winget: "GitHub.cli", scoop: "gh", choco: "gh" },
    });
    expect(arg.manualMessage).toMatch(/github\.com\/cli\/cli/);
  });
});

describe("SelfProvider.updateAll", () => {
  it("iterates sequentially over packages and returns outcomes in order", async () => {
    isElevatedMock.mockResolvedValue(true);
    runInheritMock.mockResolvedValue(mkRun(""));

    const outcomes = await new SelfProvider().updateAll([
      { id: "npm", current: "1", latest: "2" },
      { id: "pipx", current: "1", latest: "2" },
      { id: "unknown", current: "1", latest: "2" },
    ]);

    expect(outcomes.map((o) => o.id)).toEqual(["npm", "pipx", "unknown"]);
    expect(outcomes[0]).toEqual({ id: "npm", success: true });
    expect(outcomes[1]).toEqual({ id: "pipx", success: true });
    expect(outcomes[2]).toMatchObject({
      id: "unknown",
      success: false,
      message: "Cible self inconnue",
    });
    expect(runInheritMock.mock.calls.map((c) => c[0])).toEqual(["npm", "pipx"]);
  });
});
