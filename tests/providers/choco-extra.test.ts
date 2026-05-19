import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { commandExistsMock, runMock, runInheritMock, isElevatedMock } = vi.hoisted(() => ({
  commandExistsMock: vi.fn(),
  runMock: vi.fn(),
  runInheritMock: vi.fn(),
  isElevatedMock: vi.fn(),
}));

vi.mock("../../src/core/runner.js", () => ({
  commandExists: commandExistsMock,
  run: runMock,
  runInherit: runInheritMock,
  isElevated: isElevatedMock,
  whichFirst: vi.fn(),
}));

import { ChocoProvider } from "../../src/providers/os/choco.js";

function mkRun(stdout: string, failed = false) {
  return { stdout, stderr: "", exitCode: failed ? 1 : 0, failed };
}

beforeEach(() => {
  commandExistsMock.mockReset();
  runMock.mockReset();
  runInheritMock.mockReset();
  isElevatedMock.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("ChocoProvider.isAvailable", () => {
  it("returns true when choco is on PATH", async () => {
    commandExistsMock.mockResolvedValueOnce(true);
    await expect(new ChocoProvider().isAvailable()).resolves.toBe(true);
    expect(commandExistsMock).toHaveBeenCalledWith("choco");
  });

  it("returns false otherwise", async () => {
    commandExistsMock.mockResolvedValueOnce(false);
    await expect(new ChocoProvider().isAvailable()).resolves.toBe(false);
  });
});

describe("ChocoProvider.listOutdated", () => {
  it("forwards stdout to parseChocoOutdated and returns outdated rows", async () => {
    runMock.mockResolvedValueOnce(
      mkRun("git|2.43.0|2.44.0|false\nnodejs|20.10.0|20.11.0|true\n"),
    );
    const pkgs = await new ChocoProvider().listOutdated();
    expect(pkgs.map((p) => p.id)).toEqual(["git", "nodejs"]);
    expect(pkgs[1]?.note).toBe("pinned");
    expect(runMock).toHaveBeenCalledWith("choco", [
      "outdated",
      "-r",
      "--limit-output",
    ]);
  });

  it("returns [] when choco produces no parseable lines", async () => {
    runMock.mockResolvedValueOnce(mkRun(""));
    await expect(new ChocoProvider().listOutdated()).resolves.toEqual([]);
  });
});

describe("ChocoProvider.update", () => {
  it("returns skipped + French elevation message when not elevated", async () => {
    isElevatedMock.mockResolvedValueOnce(false);
    const res = await new ChocoProvider().update("git");
    expect(res).toMatchObject({ id: "git", success: false, skipped: true });
    expect(res.message).toMatch(/admin/i);
    expect(runInheritMock).not.toHaveBeenCalled();
  });

  it("runs `choco upgrade <id> -y` when elevated", async () => {
    isElevatedMock.mockResolvedValueOnce(true);
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new ChocoProvider().update("git");
    expect(res).toEqual({ id: "git", success: true });
    expect(runInheritMock).toHaveBeenCalledWith("choco", ["upgrade", "git", "-y"]);
  });

  it("reports failure when choco upgrade returns a non-zero exit code", async () => {
    isElevatedMock.mockResolvedValueOnce(true);
    runInheritMock.mockResolvedValueOnce(mkRun("", true));
    const res = await new ChocoProvider().update("git");
    expect(res).toEqual({ id: "git", success: false });
  });
});

describe("ChocoProvider.updateAll", () => {
  it("returns [] when no packages provided (no elevation probe, no command)", async () => {
    const outcomes = await new ChocoProvider().updateAll([]);
    expect(outcomes).toEqual([]);
    expect(isElevatedMock).not.toHaveBeenCalled();
    expect(runInheritMock).not.toHaveBeenCalled();
  });

  it("returns skipped per-package when not elevated", async () => {
    isElevatedMock.mockResolvedValueOnce(false);
    const outcomes = await new ChocoProvider().updateAll([
      { id: "git", current: "1", latest: "2" },
      { id: "nodejs", current: "1", latest: "2" },
    ]);
    expect(outcomes).toHaveLength(2);
    for (const o of outcomes) {
      expect(o).toMatchObject({ success: false, skipped: true });
      expect(o.message).toMatch(/admin/i);
    }
    expect(runInheritMock).not.toHaveBeenCalled();
  });

  it("runs `choco upgrade all -y` once and maps result to every package when elevated", async () => {
    isElevatedMock.mockResolvedValueOnce(true);
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const outcomes = await new ChocoProvider().updateAll([
      { id: "git", current: "1", latest: "2" },
      { id: "nodejs", current: "1", latest: "2" },
    ]);
    expect(outcomes).toEqual([
      { id: "git", success: true },
      { id: "nodejs", success: true },
    ]);
    expect(runInheritMock).toHaveBeenCalledTimes(1);
    expect(runInheritMock).toHaveBeenCalledWith("choco", [
      "upgrade",
      "all",
      "-y",
    ]);
  });

  it("propagates bulk failure to every outcome when elevated", async () => {
    isElevatedMock.mockResolvedValueOnce(true);
    runInheritMock.mockResolvedValueOnce(mkRun("", true));
    const outcomes = await new ChocoProvider().updateAll([
      { id: "git", current: "1", latest: "2" },
      { id: "nodejs", current: "1", latest: "2" },
    ]);
    expect(outcomes.every((o) => o.success === false)).toBe(true);
    expect(outcomes.map((o) => o.id)).toEqual(["git", "nodejs"]);
  });
});
