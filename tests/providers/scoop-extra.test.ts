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

import { ScoopProvider, parseScoopStatus } from "../../src/providers/os/scoop.js";

function mkRun(stdout: string, failed = false) {
  return { stdout, stderr: "", exitCode: failed ? 1 : 0, failed };
}

beforeEach(() => {
  commandExistsMock.mockReset();
  runMock.mockReset();
  runInheritMock.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("parseScoopStatus direct edge cases", () => {
  it("skips rows that don't produce at least three whitespace-separated columns", () => {
    const out = `
Name      Installed Version  Latest Version  Missing Dependencies  Info
----      -----------------  --------------  --------------------  ----
loner
gh        2.40.0             2.42.1
`;
    const pkgs = parseScoopStatus(out);
    expect(pkgs.map((p) => p.id)).toEqual(["gh"]);
  });
});

describe("ScoopProvider.isAvailable", () => {
  it("returns true when scoop is on PATH", async () => {
    commandExistsMock.mockResolvedValueOnce(true);
    await expect(new ScoopProvider().isAvailable()).resolves.toBe(true);
    expect(commandExistsMock).toHaveBeenCalledWith("scoop");
  });

  it("returns false otherwise", async () => {
    commandExistsMock.mockResolvedValueOnce(false);
    await expect(new ScoopProvider().isAvailable()).resolves.toBe(false);
  });
});

describe("ScoopProvider.listOutdated", () => {
  it("forwards stdout to parseScoopStatus and returns outdated rows", async () => {
    const out = `
Name      Installed Version  Latest Version  Missing Dependencies  Info
----      -----------------  --------------  --------------------  ----
gh        2.40.0             2.42.1
nodejs    20.10.0            20.11.1
`;
    runMock.mockResolvedValueOnce(mkRun(out));
    const pkgs = await new ScoopProvider().listOutdated();
    expect(pkgs.map((p) => p.id)).toEqual(["gh", "nodejs"]);
    expect(runMock).toHaveBeenCalledWith("scoop", ["status"]);
  });

  it("returns [] when scoop reports nothing parseable", async () => {
    runMock.mockResolvedValueOnce(mkRun("Scoop is up to date.\n"));
    await expect(new ScoopProvider().listOutdated()).resolves.toEqual([]);
  });
});

describe("ScoopProvider.update", () => {
  it("runs `scoop update <id>` with shell:true and returns success", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new ScoopProvider().update("gh");
    expect(res).toEqual({ id: "gh", success: true });
    expect(runInheritMock).toHaveBeenCalledWith("scoop", ["update", "gh"], {
      shell: true,
    });
  });

  it("reports failure when scoop returns a non-zero exit code", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun("", true));
    const res = await new ScoopProvider().update("gh");
    expect(res).toEqual({ id: "gh", success: false });
  });

  it("does not quote/transform the package id (shell:true is responsibility of caller)", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    await new ScoopProvider().update("with-dash_name");
    const args = runInheritMock.mock.calls[0]![1] as string[];
    expect(args).toEqual(["update", "with-dash_name"]);
  });
});

describe("ScoopProvider.updateAll", () => {
  it("returns [] when no packages provided (skips the bulk command)", async () => {
    await expect(new ScoopProvider().updateAll([])).resolves.toEqual([]);
    expect(runInheritMock).not.toHaveBeenCalled();
  });

  it("runs `scoop update *` once and maps the result to every package", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const outcomes = await new ScoopProvider().updateAll([
      { id: "gh", current: "1", latest: "2" },
      { id: "nodejs", current: "1", latest: "2" },
    ]);
    expect(outcomes).toEqual([
      { id: "gh", success: true },
      { id: "nodejs", success: true },
    ]);
    expect(runInheritMock).toHaveBeenCalledTimes(1);
    expect(runInheritMock).toHaveBeenCalledWith("scoop", ["update", "*"], {
      shell: true,
    });
  });

  it("propagates bulk failure to every package outcome", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun("", true));
    const outcomes = await new ScoopProvider().updateAll([
      { id: "gh", current: "1", latest: "2" },
      { id: "nodejs", current: "1", latest: "2" },
    ]);
    expect(outcomes.every((o) => o.success === false)).toBe(true);
    expect(outcomes.map((o) => o.id)).toEqual(["gh", "nodejs"]);
  });
});
