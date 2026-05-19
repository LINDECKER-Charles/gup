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

const { fetchGitHubReleaseLatestMock } = vi.hoisted(() => ({
  fetchGitHubReleaseLatestMock: vi.fn(),
}));

vi.mock("../../src/core/gh-releases.js", () => ({
  fetchGitHubReleaseLatest: fetchGitHubReleaseLatestMock,
  fetchGitHubReleaseTagMatching: vi.fn(),
  normalizeVersion: (v: string) => v.trim().replace(/^v/i, "").toLowerCase(),
}));

import { CoursierCsProvider } from "../../src/providers/jvm/coursier-cs.js";
import { JBangProvider } from "../../src/providers/jvm/jbang.js";

function mkRun(stdout: string, failed = false) {
  return { stdout, stderr: "", exitCode: failed ? 1 : 0, failed };
}

beforeEach(() => {
  commandExistsMock.mockReset();
  runMock.mockReset();
  runInheritMock.mockReset();
  fetchGitHubReleaseLatestMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("CoursierCsProvider", () => {
  it("isAvailable wires through commandExists", async () => {
    commandExistsMock.mockResolvedValueOnce(true);
    await expect(new CoursierCsProvider().isAvailable()).resolves.toBe(true);
    commandExistsMock.mockResolvedValueOnce(false);
    await expect(new CoursierCsProvider().isAvailable()).resolves.toBe(false);
  });

  it("listOutdated returns [] when cs --version fails", async () => {
    runMock.mockResolvedValueOnce(mkRun("", true));
    await expect(new CoursierCsProvider().listOutdated()).resolves.toEqual([]);
    expect(fetchGitHubReleaseLatestMock).not.toHaveBeenCalled();
  });

  it("listOutdated returns [] when no version can be parsed", async () => {
    runMock.mockResolvedValueOnce(mkRun("garbage"));
    await expect(new CoursierCsProvider().listOutdated()).resolves.toEqual([]);
    expect(fetchGitHubReleaseLatestMock).not.toHaveBeenCalled();
  });

  it("listOutdated returns [] when fetchGitHubReleaseLatest is null", async () => {
    runMock.mockResolvedValueOnce(mkRun("Coursier 2.1.10 (commit abc)"));
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce(null);
    await expect(new CoursierCsProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when latest equals current", async () => {
    runMock.mockResolvedValueOnce(mkRun("Coursier 2.1.10"));
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("2.1.10");
    await expect(new CoursierCsProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns a row when newer version exists (with 'Coursier' prefix)", async () => {
    runMock.mockResolvedValueOnce(mkRun("Coursier 2.1.10 (commit deadbeef)"));
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("2.1.12");

    const rows = await new CoursierCsProvider().listOutdated();
    expect(rows).toEqual([
      {
        id: "coursier-cs",
        name: "Coursier (cs)",
        current: "2.1.10",
        latest: "2.1.12",
        note: "runs `cs update` for installed apps",
      },
    ]);
    expect(fetchGitHubReleaseLatestMock).toHaveBeenCalledWith(
      "coursier/coursier",
    );
  });

  it("listOutdated parses a bare version output (no 'Coursier' prefix)", async () => {
    runMock.mockResolvedValueOnce(mkRun("v2.1.10"));
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("2.1.12");
    const rows = await new CoursierCsProvider().listOutdated();
    expect(rows[0]).toMatchObject({ current: "2.1.10", latest: "2.1.12" });
  });

  it("update invokes cs update", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new CoursierCsProvider().update("coursier-cs");
    expect(res).toEqual({ id: "coursier-cs", success: true });
    expect(runInheritMock).toHaveBeenCalledWith("cs", ["update"]);
  });

  it("update reports failure on non-zero exit", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun("", true));
    const res = await new CoursierCsProvider().update("coursier-cs");
    expect(res).toEqual({ id: "coursier-cs", success: false });
  });

  it("updateAll returns [] when no packages", async () => {
    await expect(new CoursierCsProvider().updateAll([])).resolves.toEqual([]);
    expect(runInheritMock).not.toHaveBeenCalled();
  });

  it("updateAll triggers update once when packages present", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new CoursierCsProvider().updateAll([
      { id: "coursier-cs", current: "2.1.10", latest: "2.1.12" },
    ]);
    expect(res).toEqual([{ id: "coursier-cs", success: true }]);
  });
});

describe("JBangProvider", () => {
  it("isAvailable wires through commandExists", async () => {
    commandExistsMock.mockResolvedValueOnce(true);
    await expect(new JBangProvider().isAvailable()).resolves.toBe(true);
    commandExistsMock.mockResolvedValueOnce(false);
    await expect(new JBangProvider().isAvailable()).resolves.toBe(false);
  });

  it("listOutdated returns [] when jbang version fails", async () => {
    runMock.mockResolvedValueOnce(mkRun("", true));
    await expect(new JBangProvider().listOutdated()).resolves.toEqual([]);
    expect(fetchGitHubReleaseLatestMock).not.toHaveBeenCalled();
  });

  it("listOutdated returns [] when first line is empty", async () => {
    runMock.mockResolvedValueOnce(mkRun(""));
    await expect(new JBangProvider().listOutdated()).resolves.toEqual([]);
    expect(fetchGitHubReleaseLatestMock).not.toHaveBeenCalled();
  });

  it("listOutdated returns [] when version cannot be parsed", async () => {
    runMock.mockResolvedValueOnce(mkRun("not-a-version\nmore stuff"));
    await expect(new JBangProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when fetchGitHubReleaseLatest is null", async () => {
    runMock.mockResolvedValueOnce(mkRun("0.118.0"));
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce(null);
    await expect(new JBangProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when latest equals current", async () => {
    runMock.mockResolvedValueOnce(mkRun("0.118.0"));
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("0.118.0");
    await expect(new JBangProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns a row when newer version exists", async () => {
    runMock.mockResolvedValueOnce(mkRun("v0.118.0\nadditional banner"));
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("0.119.0");

    const rows = await new JBangProvider().listOutdated();
    expect(rows).toEqual([
      { id: "jbang", name: "JBang", current: "0.118.0", latest: "0.119.0" },
    ]);
    expect(fetchGitHubReleaseLatestMock).toHaveBeenCalledWith("jbangdev/jbang");
  });

  it("update invokes jbang version --update", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new JBangProvider().update("jbang");
    expect(res).toEqual({ id: "jbang", success: true });
    expect(runInheritMock).toHaveBeenCalledWith("jbang", ["version", "--update"]);
  });

  it("update reports failure on non-zero exit", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun("", true));
    const res = await new JBangProvider().update("jbang");
    expect(res).toEqual({ id: "jbang", success: false });
  });

  it("updateAll returns [] when no packages", async () => {
    await expect(new JBangProvider().updateAll([])).resolves.toEqual([]);
  });

  it("updateAll triggers update once when packages present", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new JBangProvider().updateAll([
      { id: "jbang", current: "0.118.0", latest: "0.119.0" },
    ]);
    expect(res).toEqual([{ id: "jbang", success: true }]);
  });
});
