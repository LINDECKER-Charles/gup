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

vi.mock("../../src/core/gh-releases.js", async () => {
  const actual =
    await vi.importActual<typeof import("../../src/core/gh-releases.js")>(
      "../../src/core/gh-releases.js",
    );
  return {
    ...actual,
    fetchGitHubReleaseLatest: fetchGitHubReleaseLatestMock,
  };
});

const { existsSyncMock } = vi.hoisted(() => ({ existsSyncMock: vi.fn() }));
vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  return { ...actual, existsSync: existsSyncMock };
});

const { homedirMock } = vi.hoisted(() => ({ homedirMock: vi.fn(() => "/home/u") }));
vi.mock("node:os", async () => {
  const actual = await vi.importActual<typeof import("node:os")>("node:os");
  return { ...actual, homedir: homedirMock };
});

import { AsdfProvider } from "../../src/providers/toolchain/asdf.js";
import { GoenvProvider } from "../../src/providers/toolchain/goenv.js";
import { MiseProvider } from "../../src/providers/toolchain/mise.js";
import { ProtoProvider } from "../../src/providers/toolchain/proto.js";
import { SdkmanProvider } from "../../src/providers/toolchain/sdkman.js";

function mkRun(stdout: string, failed = false) {
  return { stdout, stderr: "", exitCode: failed ? 1 : 0, failed };
}

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as unknown as Response;
}

function textResponse(body: string, ok = true): Response {
  return { ok, text: async () => body } as unknown as Response;
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  commandExistsMock.mockReset();
  runMock.mockReset();
  runInheritMock.mockReset();
  fetchGitHubReleaseLatestMock.mockReset();
  existsSyncMock.mockReset();
  homedirMock.mockReset();
  homedirMock.mockReturnValue("/home/u");
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/* ----------------------------------------------------------------- asdf */
describe("AsdfProvider", () => {
  it("isAvailable wires through commandExists", async () => {
    commandExistsMock.mockResolvedValueOnce(true);
    await expect(new AsdfProvider().isAvailable()).resolves.toBe(true);
    commandExistsMock.mockResolvedValueOnce(false);
    await expect(new AsdfProvider().isAvailable()).resolves.toBe(false);
  });

  it("listOutdated [] on probe failure", async () => {
    runMock.mockResolvedValueOnce(mkRun("", true));
    await expect(new AsdfProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated [] when version cannot be parsed", async () => {
    runMock.mockResolvedValueOnce(mkRun("nothing"));
    await expect(new AsdfProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated [] when fetchGitHubReleaseLatest is null", async () => {
    runMock.mockResolvedValueOnce(mkRun("v0.14.0-abc1234"));
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce(null);
    await expect(new AsdfProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated [] when normalized core equals latest", async () => {
    runMock.mockResolvedValueOnce(mkRun("v0.14.0-abc1234"));
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("0.14.0");
    await expect(new AsdfProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns a row when versions differ", async () => {
    // `isLegacyInstall` regex (`/v0\.(?:[0-9]|1[0-5])\b/`) is applied to the
    // already-stripped capture group (no leading 'v'), so the check is always
    // false from listOutdated's call site and manual ends up set.
    runMock.mockResolvedValueOnce(mkRun("v0.14.0-abc1234"));
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("0.16.7");
    const rows = await new AsdfProvider().listOutdated();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: "asdf",
      current: "0.14.0-abc1234",
      latest: "0.16.7",
      manual: true,
    });
  });

  it("listOutdated marks Go-rewrite install as manual", async () => {
    runMock.mockResolvedValueOnce(mkRun("0.16.7 (revision abc1234)"));
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("0.17.0");
    const rows = await new AsdfProvider().listOutdated();
    expect(rows[0]).toMatchObject({
      id: "asdf",
      current: "0.16.7",
      latest: "0.17.0",
      manual: true,
    });
  });

  it("update returns skipped on non-legacy", async () => {
    runMock.mockResolvedValueOnce(mkRun("0.16.7 (revision abc1234)"));
    const res = await new AsdfProvider().update("asdf");
    expect(res).toMatchObject({ id: "asdf", success: false, skipped: true });
    expect(res.message).toMatch(/binaire/i);
    expect(runInheritMock).not.toHaveBeenCalled();
  });

  it("update runs `asdf update` on legacy", async () => {
    runMock.mockResolvedValueOnce(mkRun("v0.14.0-abc1234"));
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new AsdfProvider().update("asdf");
    expect(res).toEqual({ id: "asdf", success: true });
    expect(runInheritMock).toHaveBeenCalledWith("asdf", ["update"]);
  });

  it("update returns failure when runInherit fails on legacy", async () => {
    runMock.mockResolvedValueOnce(mkRun("v0.14.0-abc"));
    runInheritMock.mockResolvedValueOnce(mkRun("", true));
    const res = await new AsdfProvider().update("asdf");
    expect(res).toEqual({ id: "asdf", success: false });
  });

  it("updateAll [] short-circuits", async () => {
    await expect(new AsdfProvider().updateAll([])).resolves.toEqual([]);
  });

  it("updateAll non-empty delegates", async () => {
    runMock.mockResolvedValueOnce(mkRun("v0.14.0-abc"));
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new AsdfProvider().updateAll([
      { id: "asdf", current: "1", latest: "2" } as never,
    ]);
    expect(res).toEqual([{ id: "asdf", success: true }]);
  });
});

/* ---------------------------------------------------------------- goenv */
describe("GoenvProvider", () => {
  it("isAvailable wires through commandExists", async () => {
    commandExistsMock.mockResolvedValueOnce(true);
    await expect(new GoenvProvider().isAvailable()).resolves.toBe(true);
    commandExistsMock.mockResolvedValueOnce(false);
    await expect(new GoenvProvider().isAvailable()).resolves.toBe(false);
  });

  it("listOutdated [] on probe failure", async () => {
    runMock.mockResolvedValueOnce(mkRun("", true));
    await expect(new GoenvProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated [] when version unparsable", async () => {
    runMock.mockResolvedValueOnce(mkRun("???"));
    await expect(new GoenvProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated [] when latest null", async () => {
    runMock.mockResolvedValueOnce(mkRun("goenv 2.2.13"));
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce(null);
    await expect(new GoenvProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated [] when equal", async () => {
    runMock.mockResolvedValueOnce(mkRun("goenv 2.2.13"));
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("2.2.13");
    await expect(new GoenvProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns row when versions differ", async () => {
    runMock.mockResolvedValueOnce(mkRun("goenv 2.2.13"));
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("2.3.0");
    const rows = await new GoenvProvider().listOutdated();
    expect(rows).toEqual([
      {
        id: "goenv",
        name: "goenv",
        current: "2.2.13",
        latest: "2.3.0",
        note: "goenv update",
      },
    ]);
  });

  it("update success", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new GoenvProvider().update("goenv");
    expect(res).toEqual({ id: "goenv", success: true });
    expect(runInheritMock).toHaveBeenCalledWith("goenv", ["update"]);
  });

  it("update returns skipped with French message on failure", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun("", true));
    const res = await new GoenvProvider().update("goenv");
    expect(res).toMatchObject({ id: "goenv", success: false, skipped: true });
    expect(res.message).toMatch(/git -C/i);
  });

  it("updateAll [] short-circuits", async () => {
    await expect(new GoenvProvider().updateAll([])).resolves.toEqual([]);
  });

  it("updateAll non-empty delegates", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new GoenvProvider().updateAll([
      { id: "goenv", current: "1", latest: "2" } as never,
    ]);
    expect(res).toEqual([{ id: "goenv", success: true }]);
  });
});

/* ----------------------------------------------------------------- mise */
describe("MiseProvider", () => {
  it("isAvailable wires through commandExists", async () => {
    commandExistsMock.mockResolvedValueOnce(true);
    await expect(new MiseProvider().isAvailable()).resolves.toBe(true);
    commandExistsMock.mockResolvedValueOnce(false);
    await expect(new MiseProvider().isAvailable()).resolves.toBe(false);
  });

  it("listOutdated [] on probe fail", async () => {
    runMock.mockResolvedValueOnce(mkRun("", true));
    await expect(new MiseProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated [] on empty stdout", async () => {
    runMock.mockResolvedValueOnce(mkRun(""));
    await expect(new MiseProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated [] on invalid JSON", async () => {
    runMock.mockResolvedValueOnce(mkRun("nope"));
    await expect(new MiseProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated handles array form, skipping incomplete and up-to-date entries", async () => {
    const arr = [
      { plugin: "node", current: "20.0.0", latest: "20.5.0" }, // included
      { name: "python", current: "3.12.0", latest: "3.12.0" }, // skipped (equal)
      { plugin: "missingLatest", current: "1.0.0" }, // skipped
      { plugin: "missingCurrent", latest: "1.0.0" }, // skipped
      { name: "withRequested", requested: "1.0.0", latest: "1.1.0" }, // included via requested fallback
    ];
    runMock.mockResolvedValueOnce(mkRun(JSON.stringify(arr)));
    const rows = await new MiseProvider().listOutdated();
    expect(rows).toEqual([
      { id: "node", name: "node", current: "20.0.0", latest: "20.5.0" },
      {
        id: "withRequested",
        name: "withRequested",
        current: "1.0.0",
        latest: "1.1.0",
      },
    ]);
  });

  it("listOutdated handles object form", async () => {
    runMock.mockResolvedValueOnce(
      mkRun(
        JSON.stringify({
          node: { current: "20.0.0", latest: "20.5.0" },
          python: { current: "3.12.0", latest: "3.12.0" },
        }),
      ),
    );
    const rows = await new MiseProvider().listOutdated();
    expect(rows).toEqual([
      { id: "node", name: "node", current: "20.0.0", latest: "20.5.0" },
    ]);
  });

  it("update runs `mise upgrade <id>`", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new MiseProvider().update("node");
    expect(res).toEqual({ id: "node", success: true });
    expect(runInheritMock).toHaveBeenCalledWith("mise", ["upgrade", "node"]);
  });

  it("update reports failure", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun("", true));
    const res = await new MiseProvider().update("node");
    expect(res).toEqual({ id: "node", success: false });
  });

  it("updateAll [] short-circuits", async () => {
    await expect(new MiseProvider().updateAll([])).resolves.toEqual([]);
  });

  it("updateAll runs `mise upgrade` once and maps outcomes", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new MiseProvider().updateAll([
      { id: "node", current: "1", latest: "2" } as never,
      { id: "python", current: "1", latest: "2" } as never,
    ]);
    expect(res).toEqual([
      { id: "node", success: true },
      { id: "python", success: true },
    ]);
    expect(runInheritMock).toHaveBeenCalledWith("mise", ["upgrade"]);
  });
});

/* ---------------------------------------------------------------- proto */
describe("ProtoProvider", () => {
  it("isAvailable wires through commandExists", async () => {
    commandExistsMock.mockResolvedValueOnce(true);
    await expect(new ProtoProvider().isAvailable()).resolves.toBe(true);
    commandExistsMock.mockResolvedValueOnce(false);
    await expect(new ProtoProvider().isAvailable()).resolves.toBe(false);
  });

  it("listOutdated handles self failure, managed failure -> []", async () => {
    runMock
      .mockResolvedValueOnce(mkRun("", true)) // --version
      .mockResolvedValueOnce(mkRun("", true)); // outdated --json
    await expect(new ProtoProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated handles unparsable self, empty managed -> []", async () => {
    runMock
      .mockResolvedValueOnce(mkRun("nothing"))
      .mockResolvedValueOnce(mkRun(""));
    await expect(new ProtoProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated handles null-latest self and invalid-json managed -> []", async () => {
    runMock
      .mockResolvedValueOnce(mkRun("proto 0.40.4"))
      .mockResolvedValueOnce(mkRun("not json"));
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce(null);
    await expect(new ProtoProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated handles equal self and equal/incomplete managed -> []", async () => {
    runMock
      .mockResolvedValueOnce(mkRun("proto 0.40.4"))
      .mockResolvedValueOnce(
        mkRun(JSON.stringify({ node: { current: "20.0.0", newest: "20.0.0" } })),
      );
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("0.40.4");
    await expect(new ProtoProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated combines self + managed (object form) with newest fallback", async () => {
    runMock
      .mockResolvedValueOnce(mkRun("proto 0.40.4"))
      .mockResolvedValueOnce(
        mkRun(
          JSON.stringify({
            node: { current: "20.0.0", newest: "20.5.0" },
            deno: { current: "1.40.0", latest: "1.41.0" },
            bun: { current: "1.0.0" }, // incomplete
            sameVersion: { current: "1.0.0", newest: "1.0.0" }, // equal
          }),
        ),
      );
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("0.41.0");
    const rows = await new ProtoProvider().listOutdated();
    expect(rows).toEqual([
      { id: "proto", name: "proto", current: "0.40.4", latest: "0.41.0" },
      { id: "node", name: "node", current: "20.0.0", latest: "20.5.0" },
      { id: "deno", name: "deno", current: "1.40.0", latest: "1.41.0" },
    ]);
  });

  it("listOutdated handles managed array form", async () => {
    runMock
      .mockResolvedValueOnce(mkRun("0.40.4"))
      .mockResolvedValueOnce(
        mkRun(JSON.stringify([{ current: "20.0.0", newest: "20.5.0" }])),
      );
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("0.40.4"); // equal -> no self
    const rows = await new ProtoProvider().listOutdated();
    expect(rows).toEqual([
      { id: "0", name: "0", current: "20.0.0", latest: "20.5.0" },
    ]);
  });

  it("update with id 'proto' runs `proto upgrade`", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new ProtoProvider().update("proto");
    expect(res).toEqual({ id: "proto", success: true });
    expect(runInheritMock).toHaveBeenCalledWith("proto", ["upgrade"]);
  });

  it("update with other id runs `proto install <id>`", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun("", true));
    const res = await new ProtoProvider().update("node");
    expect(res).toEqual({ id: "node", success: false });
    expect(runInheritMock).toHaveBeenCalledWith("proto", ["install", "node"]);
  });

  it("updateAll [] short-circuits", async () => {
    await expect(new ProtoProvider().updateAll([])).resolves.toEqual([]);
  });

  it("updateAll iterates sequentially per package", async () => {
    runInheritMock
      .mockResolvedValueOnce(mkRun("")) // proto
      .mockResolvedValueOnce(mkRun("", true)); // node
    const res = await new ProtoProvider().updateAll([
      { id: "proto", current: "1", latest: "2" } as never,
      { id: "node", current: "1", latest: "2" } as never,
    ]);
    expect(res).toEqual([
      { id: "proto", success: true },
      { id: "node", success: false },
    ]);
    expect(runInheritMock).toHaveBeenNthCalledWith(1, "proto", ["upgrade"]);
    expect(runInheritMock).toHaveBeenNthCalledWith(2, "proto", ["install", "node"]);
  });
});

/* ---------------------------------------------------------------- sdkman */
describe("SdkmanProvider", () => {
  it("isAvailable false when init script missing", async () => {
    existsSyncMock.mockReturnValueOnce(false);
    await expect(new SdkmanProvider().isAvailable()).resolves.toBe(false);
    expect(commandExistsMock).not.toHaveBeenCalled();
  });

  it("isAvailable false when bash missing", async () => {
    existsSyncMock.mockReturnValueOnce(true);
    commandExistsMock.mockResolvedValueOnce(false);
    await expect(new SdkmanProvider().isAvailable()).resolves.toBe(false);
  });

  it("isAvailable true when both init script and bash exist", async () => {
    existsSyncMock.mockReturnValueOnce(true);
    commandExistsMock.mockResolvedValueOnce(true);
    await expect(new SdkmanProvider().isAvailable()).resolves.toBe(true);
  });

  it("listOutdated [] when sdk version cannot be parsed (failed run)", async () => {
    runMock.mockResolvedValueOnce(mkRun("", true));
    await expect(new SdkmanProvider().listOutdated()).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("listOutdated [] when sdk version output has no number", async () => {
    runMock.mockResolvedValueOnce(mkRun("nothing"));
    await expect(new SdkmanProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated [] when fetch !ok", async () => {
    runMock.mockResolvedValueOnce(mkRun("SDKMAN script: 5.18.2"));
    fetchMock.mockResolvedValueOnce(textResponse("", false));
    await expect(new SdkmanProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated [] when fetch throws", async () => {
    runMock.mockResolvedValueOnce(mkRun("SDKMAN script: 5.18.2"));
    fetchMock.mockRejectedValueOnce(new Error("net"));
    await expect(new SdkmanProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated [] when versions equal", async () => {
    runMock.mockResolvedValueOnce(mkRun("SDKMAN script: 5.18.2"));
    fetchMock.mockResolvedValueOnce(textResponse("5.18.2"));
    await expect(new SdkmanProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns row when versions differ", async () => {
    runMock.mockResolvedValueOnce(mkRun("SDKMAN script: 5.18.2"));
    fetchMock.mockResolvedValueOnce(textResponse("5.19.0\n"));
    const rows = await new SdkmanProvider().listOutdated();
    expect(rows).toEqual([
      {
        id: "sdkman",
        name: "SDKMAN!",
        current: "5.18.2",
        latest: "5.19.0",
        note: "sdk selfupdate force",
      },
    ]);
  });

  it("update runs `sdk selfupdate force` via bash", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new SdkmanProvider().update("sdkman");
    expect(res).toEqual({ id: "sdkman", success: true });
    expect(runInheritMock).toHaveBeenCalledWith(
      "bash",
      expect.arrayContaining(["-lc"]),
    );
    const args = runInheritMock.mock.calls[0]![1] as string[];
    expect(args[1]).toMatch(/sdk selfupdate force/);
  });

  it("update reports failure", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun("", true));
    const res = await new SdkmanProvider().update("sdkman");
    expect(res).toEqual({ id: "sdkman", success: false });
  });

  it("updateAll [] short-circuits", async () => {
    await expect(new SdkmanProvider().updateAll([])).resolves.toEqual([]);
  });

  it("updateAll non-empty delegates", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new SdkmanProvider().updateAll([
      { id: "sdkman", current: "1", latest: "2" } as never,
    ]);
    expect(res).toEqual([{ id: "sdkman", success: true }]);
  });
});
