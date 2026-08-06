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
  fetchGitHubReleaseTagMatching: vi.fn(),
  normalizeVersion: (v: string) => v.replace(/^v/, ""),
}));

const {
  existsSyncMock,
  mkdirMock,
  readdirMock,
  readFileMock,
  rmMock,
  writeFileMock,
  copyFileMock,
} = vi.hoisted(() => ({
  existsSyncMock: vi.fn(),
  mkdirMock: vi.fn(),
  readdirMock: vi.fn(),
  readFileMock: vi.fn(),
  rmMock: vi.fn(),
  writeFileMock: vi.fn(),
  copyFileMock: vi.fn(),
}));

vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  return { ...actual, existsSync: existsSyncMock };
});

vi.mock("node:fs/promises", async () => {
  const actual = await vi.importActual<typeof import("node:fs/promises")>(
    "node:fs/promises",
  );
  return {
    ...actual,
    mkdir: mkdirMock,
    readdir: readdirMock,
    readFile: readFileMock,
    rm: rmMock,
    writeFile: writeFileMock,
    copyFile: copyFileMock,
  };
});

const { admZipImpl, FakeAdmZipCtor } = vi.hoisted(() => {
  const impl: { current: ((buf: Buffer) => unknown) | null } = { current: null };
  class FakeAdmZip {
    constructor(buf: Buffer) {
      if (!impl.current) {
        throw new Error("adm-zip impl not configured");
      }
      const result = impl.current(buf) as Record<string, unknown>;
      for (const [k, v] of Object.entries(result)) {
        (this as Record<string, unknown>)[k] = v;
      }
    }
  }
  return { admZipImpl: impl, FakeAdmZipCtor: FakeAdmZip };
});

vi.mock("adm-zip", () => ({ default: FakeAdmZipCtor }));

function setZip(impl: (buf: Buffer) => unknown): void {
  admZipImpl.current = impl;
}
function setZipThrow(err: unknown): void {
  admZipImpl.current = () => {
    throw err;
  };
}

import { NerdFontsProvider } from "../../src/providers/shell/nerd-fonts.js";
import { OhMyPoshProvider } from "../../src/providers/shell/oh-my-posh.js";
import { PwshModulesProvider } from "../../src/providers/shell/pwsh-modules.js";
import { StarshipProvider } from "../../src/providers/shell/starship.js";

function mkRun(stdout: string, failed = false, stderr = "") {
  return { stdout, stderr, exitCode: failed ? 1 : 0, failed };
}

let fetchMock: ReturnType<typeof vi.fn>;
let originalPlatform: PropertyDescriptor | undefined;
let originalLocalAppData: string | undefined;
let stdoutWriteSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  commandExistsMock.mockReset();
  runMock.mockReset();
  runInheritMock.mockReset();
  delegateUpdateMock.mockReset();
  detectInstallSourceMock.mockReset();
  describeSourceMock.mockReset();
  fetchGitHubReleaseLatestMock.mockReset();
  existsSyncMock.mockReset();
  mkdirMock.mockReset();
  readdirMock.mockReset();
  readFileMock.mockReset();
  rmMock.mockReset();
  writeFileMock.mockReset();
  copyFileMock.mockReset();
  admZipImpl.current = null;

  detectInstallSourceMock.mockResolvedValue("scoop");
  describeSourceMock.mockReturnValue("via scoop");
  mkdirMock.mockResolvedValue(undefined);
  writeFileMock.mockResolvedValue(undefined);
  copyFileMock.mockResolvedValue(undefined);
  rmMock.mockResolvedValue(undefined);

  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

  originalPlatform = Object.getOwnPropertyDescriptor(process, "platform");
  Object.defineProperty(process, "platform", { value: "win32", configurable: true });

  originalLocalAppData = process.env["LOCALAPPDATA"];
  process.env["LOCALAPPDATA"] = "C:\\Users\\test\\AppData\\Local";

  stdoutWriteSpy = vi
    .spyOn(process.stdout, "write")
    .mockImplementation(() => true);
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (originalPlatform) {
    Object.defineProperty(process, "platform", originalPlatform);
  }
  if (originalLocalAppData === undefined) {
    delete process.env["LOCALAPPDATA"];
  } else {
    process.env["LOCALAPPDATA"] = originalLocalAppData;
  }
  stdoutWriteSpy.mockRestore();
});

// ---------------------------------------------------------------------------
// OhMyPoshProvider
// ---------------------------------------------------------------------------

describe("OhMyPoshProvider", () => {
  it("isAvailable wires through commandExists", async () => {
    commandExistsMock.mockResolvedValueOnce(true);
    await expect(new OhMyPoshProvider().isAvailable()).resolves.toBe(true);
    commandExistsMock.mockResolvedValueOnce(false);
    await expect(new OhMyPoshProvider().isAvailable()).resolves.toBe(false);
  });

  it("listOutdated returns [] when probe fails", async () => {
    runMock.mockResolvedValueOnce(mkRun("", true));
    await expect(new OhMyPoshProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when output has no version", async () => {
    runMock.mockResolvedValueOnce(mkRun("garbage"));
    await expect(new OhMyPoshProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when latest is null", async () => {
    runMock.mockResolvedValueOnce(mkRun("23.6.0\n"));
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce(null);
    await expect(new OhMyPoshProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when current == latest", async () => {
    runMock.mockResolvedValueOnce(mkRun("23.6.0\n"));
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("23.6.0");
    await expect(new OhMyPoshProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns a row when versions differ", async () => {
    runMock.mockResolvedValueOnce(mkRun("v23.6.0\n"));
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("23.7.0");
    const rows = await new OhMyPoshProvider().listOutdated();
    expect(rows).toEqual([
      { id: "oh-my-posh", name: "Oh My Posh", current: "23.6.0", latest: "23.7.0" },
    ]);
  });

  it("update runs `oh-my-posh upgrade`", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new OhMyPoshProvider().update("oh-my-posh");
    expect(res).toEqual({ id: "oh-my-posh", success: true });
    expect(runInheritMock).toHaveBeenCalledWith("oh-my-posh", ["upgrade"]);
  });

  it("update propagates failure", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun("", true));
    const res = await new OhMyPoshProvider().update("oh-my-posh");
    expect(res).toEqual({ id: "oh-my-posh", success: false });
  });

  it("updateAll empty short-circuits", async () => {
    await expect(new OhMyPoshProvider().updateAll([])).resolves.toEqual([]);
  });

  it("updateAll non-empty runs once", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new OhMyPoshProvider().updateAll([
      { id: "oh-my-posh" } as never,
    ]);
    expect(res).toEqual([{ id: "oh-my-posh", success: true }]);
  });
});

// ---------------------------------------------------------------------------
// StarshipProvider
// ---------------------------------------------------------------------------

describe("StarshipProvider", () => {
  it("isAvailable wires through commandExists", async () => {
    commandExistsMock.mockResolvedValueOnce(true);
    await expect(new StarshipProvider().isAvailable()).resolves.toBe(true);
    commandExistsMock.mockResolvedValueOnce(false);
    await expect(new StarshipProvider().isAvailable()).resolves.toBe(false);
  });

  it("listOutdated returns [] when probe fails", async () => {
    runMock.mockResolvedValueOnce(mkRun("", true));
    await expect(new StarshipProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when no version line", async () => {
    runMock.mockResolvedValueOnce(mkRun("garbage"));
    await expect(new StarshipProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when latest is null", async () => {
    runMock.mockResolvedValueOnce(mkRun("starship 1.21.1"));
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce(null);
    await expect(new StarshipProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when current == latest", async () => {
    runMock.mockResolvedValueOnce(mkRun("starship 1.21.1"));
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("1.21.1");
    await expect(new StarshipProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns a row when versions differ", async () => {
    runMock.mockResolvedValueOnce(mkRun("starship 1.21.1"));
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("1.22.0");
    detectInstallSourceMock.mockResolvedValueOnce("winget");
    describeSourceMock.mockReturnValueOnce("via winget");
    const rows = await new StarshipProvider().listOutdated();
    expect(rows[0]).toMatchObject({
      id: "starship",
      current: "1.21.1",
      latest: "1.22.0",
      note: "via winget",
    });
    expect(rows[0]).not.toHaveProperty("manual");
  });

  it("listOutdated flags manual installs", async () => {
    runMock.mockResolvedValueOnce(mkRun("starship 1.21.1"));
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("1.22.0");
    detectInstallSourceMock.mockResolvedValueOnce("manual");
    describeSourceMock.mockReturnValueOnce("manuel");
    const rows = await new StarshipProvider().listOutdated();
    expect(rows[0]).toMatchObject({ manual: true });
  });

  it("update delegates with starship package ids", async () => {
    delegateUpdateMock.mockResolvedValueOnce({ id: "starship", success: true });
    await new StarshipProvider().update("starship");
    const call = delegateUpdateMock.mock.calls[0]![0];
    expect(call.binary).toBe("starship");
    expect(call.packageIds).toEqual({
      scoop: "starship",
      choco: "starship",
      winget: "Starship.Starship",
      brew: "starship",
    });
    expect(call.manualMessage).toMatch(/starship/);
  });

  it("updateAll empty short-circuits", async () => {
    await expect(new StarshipProvider().updateAll([])).resolves.toEqual([]);
  });

  it("updateAll non-empty delegates once", async () => {
    delegateUpdateMock.mockResolvedValueOnce({ id: "starship", success: true });
    const res = await new StarshipProvider().updateAll([
      { id: "starship" } as never,
    ]);
    expect(res).toEqual([{ id: "starship", success: true }]);
  });
});

// ---------------------------------------------------------------------------
// PwshModulesProvider
// ---------------------------------------------------------------------------

describe("PwshModulesProvider", () => {
  it("isAvailable returns true when pwsh is present", async () => {
    commandExistsMock.mockImplementation(async (bin: string) => bin === "pwsh");
    await expect(new PwshModulesProvider().isAvailable()).resolves.toBe(true);
  });

  it("isAvailable returns true when only powershell is present", async () => {
    commandExistsMock.mockImplementation(async (bin: string) => bin === "powershell");
    await expect(new PwshModulesProvider().isAvailable()).resolves.toBe(true);
  });

  it("isAvailable returns false when neither shell exists", async () => {
    commandExistsMock.mockResolvedValue(false);
    await expect(new PwshModulesProvider().isAvailable()).resolves.toBe(false);
  });

  it("listOutdated returns [] when stdout is empty/whitespace", async () => {
    commandExistsMock.mockResolvedValue(true);
    runMock.mockResolvedValueOnce(mkRun("   "));
    await expect(new PwshModulesProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] on JSON.parse failure", async () => {
    commandExistsMock.mockResolvedValue(true);
    runMock.mockResolvedValueOnce(mkRun("not-json"));
    await expect(new PwshModulesProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated handles a single-object payload (not an array)", async () => {
    commandExistsMock.mockResolvedValue(true);
    runMock.mockResolvedValueOnce(
      mkRun(
        JSON.stringify({
          Name: "Az",
          CurrentVersion: "11.0.0",
          LatestVersion: "11.1.0",
        }),
      ),
    );
    const rows = await new PwshModulesProvider().listOutdated();
    expect(rows).toEqual([
      { id: "Az", name: "Az", current: "11.0.0", latest: "11.1.0" },
    ]);
  });

  it("listOutdated handles array payload and falls back to powershell.exe", async () => {
    commandExistsMock.mockImplementation(async (bin: string) => bin === "powershell");
    runMock.mockResolvedValueOnce(
      mkRun(
        JSON.stringify([
          { Name: "Pester", CurrentVersion: "5.4.0", LatestVersion: "5.5.0" },
          { Name: "PSReadLine", CurrentVersion: "2.2.6", LatestVersion: "2.3.0" },
        ]),
      ),
    );
    const rows = await new PwshModulesProvider().listOutdated();
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.id)).toEqual(["Pester", "PSReadLine"]);
    expect(runMock).toHaveBeenCalledWith("powershell", expect.any(Array));
  });

  it("update prefers pwsh and escapes single quotes in module names", async () => {
    commandExistsMock.mockImplementation(async (bin: string) => bin === "pwsh");
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new PwshModulesProvider().update("Foo'Bar");
    expect(res).toEqual({ id: "Foo'Bar", success: true });
    const args = runInheritMock.mock.calls[0]![1] as string[];
    const script = args[args.length - 1]!;
    expect(script).toContain("Update-Module -Name 'Foo''Bar'");
  });

  it("update falls back to powershell when pwsh is missing", async () => {
    commandExistsMock.mockResolvedValue(false);
    runInheritMock.mockResolvedValueOnce(mkRun("", true));
    const res = await new PwshModulesProvider().update("Az");
    expect(res).toEqual({ id: "Az", success: false });
    expect(runInheritMock).toHaveBeenCalledWith("powershell", expect.any(Array));
  });

  it("updateAll iterates over packages in order", async () => {
    commandExistsMock.mockResolvedValue(true);
    runInheritMock
      .mockResolvedValueOnce(mkRun(""))
      .mockResolvedValueOnce(mkRun("", true));
    const res = await new PwshModulesProvider().updateAll([
      { id: "A" } as never,
      { id: "B" } as never,
    ]);
    expect(res).toEqual([
      { id: "A", success: true },
      { id: "B", success: false },
    ]);
  });

  it("updateAll handles empty arrays", async () => {
    await expect(new PwshModulesProvider().updateAll([])).resolves.toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// NerdFontsProvider
// ---------------------------------------------------------------------------

describe("NerdFontsProvider.isAvailable", () => {
  it("returns false on non-Windows", async () => {
    Object.defineProperty(process, "platform", { value: "linux", configurable: true });
    await expect(new NerdFontsProvider().isAvailable()).resolves.toBe(false);
  });

  it("returns false when LOCALAPPDATA is missing", async () => {
    delete process.env["LOCALAPPDATA"];
    await expect(new NerdFontsProvider().isAvailable()).resolves.toBe(false);
  });

  it("returns true when the lockfile exists", async () => {
    existsSyncMock.mockImplementation((p: string) => p.endsWith("nerd-fonts.json"));
    await expect(new NerdFontsProvider().isAvailable()).resolves.toBe(true);
  });

  it("returns true when fonts are detected on disk", async () => {
    existsSyncMock.mockImplementation((p: string) =>
      p.endsWith("Fonts") || p.endsWith("Microsoft\\Windows\\Fonts"),
    );
    readdirMock.mockResolvedValueOnce([
      "FiraCodeNerdFont-Regular.ttf",
    ] as never);
    await expect(new NerdFontsProvider().isAvailable()).resolves.toBe(true);
  });

  it("returns false when nothing is detected", async () => {
    existsSyncMock.mockReturnValue(false);
    await expect(new NerdFontsProvider().isAvailable()).resolves.toBe(false);
  });
});

describe("NerdFontsProvider.listOutdated", () => {
  it("returns [] when nothing detected and lockfile is empty/missing", async () => {
    existsSyncMock.mockReturnValue(false);
    await expect(new NerdFontsProvider().listOutdated()).resolves.toEqual([]);
    expect(fetchGitHubReleaseLatestMock).not.toHaveBeenCalled();
  });

  it("returns [] when latest is unreachable", async () => {
    existsSyncMock.mockImplementation((p: string) =>
      p.endsWith("Fonts") || p.endsWith("Microsoft\\Windows\\Fonts"),
    );
    readdirMock.mockResolvedValueOnce([
      "FiraCodeNerdFont-Regular.ttf",
    ] as never);
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce(null);
    await expect(new NerdFontsProvider().listOutdated()).resolves.toEqual([]);
  });

  it("swallows readdir errors gracefully", async () => {
    existsSyncMock.mockImplementation((p: string) =>
      p.endsWith("Fonts") || p.endsWith("Microsoft\\Windows\\Fonts"),
    );
    readdirMock.mockRejectedValueOnce(new Error("EACCES"));
    await expect(new NerdFontsProvider().listOutdated()).resolves.toEqual([]);
  });

  it("emits a row per detected family (without lock entry → marked unpinned)", async () => {
    existsSyncMock.mockImplementation((p: string) =>
      p.endsWith("Fonts") || p.endsWith("Microsoft\\Windows\\Fonts"),
    );
    readdirMock.mockResolvedValueOnce([
      "FiraCodeNerdFont-Regular.ttf",
      "FiraCodeNerdFontMono-Bold.otf",
      "ignored-file.txt", // hits the `NerdFont` regex miss
      "RandomFontWithoutMarker.ttf", // hits the `NerdFont` regex miss
      "FooBarNerdFont.licence", // matches NerdFont but not ttf/otf (line 247)
      "NerdFont.ttf", // no prefix at all → regex miss in familyFromFileName
      " NerdFont.ttf", // prefix is whitespace → trims to empty → null branch

      "CaskaydiaCoveNerdFont-Regular.ttf", // exercises alias mapping
    ] as never);
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("v3.4.0");
    const rows = await new NerdFontsProvider().listOutdated();
    // FiraCode (1 entry deduped) + NoFamily alias + CaskaydiaCove→CascadiaCode
    const ids = rows.map((r) => r.id).sort();
    expect(ids).toContain("FiraCode");
    expect(ids).toContain("CascadiaCode");
    expect(rows.every((r) => r.latest === "v3.4.0")).toBe(true);
    expect(rows.find((r) => r.id === "FiraCode")?.current).toBe("?");
    expect(rows.find((r) => r.id === "FiraCode")?.note).toMatch(/non suivi/);
  });

  it("merges lockfile entries with detected fonts and hides up-to-date ones", async () => {
    existsSyncMock.mockImplementation(
      (p: string) =>
        p.endsWith("Fonts") ||
        p.endsWith("Microsoft\\Windows\\Fonts") ||
        p.endsWith("nerd-fonts.json"),
    );
    readdirMock.mockResolvedValueOnce([
      "FiraCodeNerdFont-Regular.ttf",
    ] as never);
    readFileMock.mockResolvedValueOnce(
      JSON.stringify({ FiraCode: "v3.4.0", Meslo: "v3.3.0" }),
    );
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("v3.4.0");
    const rows = await new NerdFontsProvider().listOutdated();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: "Meslo", current: "v3.3.0", latest: "v3.4.0" });
    expect(rows[0]).not.toHaveProperty("note");
  });

  it("treats invalid JSON in lockfile as empty", async () => {
    existsSyncMock.mockImplementation(
      (p: string) => p.endsWith("nerd-fonts.json"),
    );
    readFileMock.mockResolvedValueOnce("not json at all");
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("v3.4.0");
    const rows = await new NerdFontsProvider().listOutdated();
    expect(rows).toEqual([]);
  });

  it("treats array JSON in lockfile as empty", async () => {
    existsSyncMock.mockImplementation((p: string) =>
      p.endsWith("nerd-fonts.json"),
    );
    readFileMock.mockResolvedValueOnce(JSON.stringify(["nope"]));
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("v3.4.0");
    const rows = await new NerdFontsProvider().listOutdated();
    expect(rows).toEqual([]);
  });

  it("filters non-string values out of the lockfile", async () => {
    existsSyncMock.mockImplementation((p: string) =>
      p.endsWith("nerd-fonts.json"),
    );
    readFileMock.mockResolvedValueOnce(
      JSON.stringify({ FiraCode: "v3.3.0", Bogus: 123, Other: null }),
    );
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("v3.4.0");
    const rows = await new NerdFontsProvider().listOutdated();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe("FiraCode");
  });
});

describe("NerdFontsProvider.update", () => {
  it("rejects non-Windows platform", async () => {
    Object.defineProperty(process, "platform", { value: "linux", configurable: true });
    const res = await new NerdFontsProvider().update("FiraCode");
    expect(res).toMatchObject({ id: "FiraCode", success: false });
    expect(res.message).toMatch(/Windows-only/);
  });

  it("rejects unsafe family names", async () => {
    const res = await new NerdFontsProvider().update("../etc/passwd");
    expect(res).toMatchObject({ id: "../etc/passwd", success: false });
    expect(res.message).toMatch(/invalide/);
  });

  it("returns failure when latest cannot be fetched", async () => {
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce(null);
    const res = await new NerdFontsProvider().update("FiraCode");
    expect(res.success).toBe(false);
    expect(res.message).toMatch(/derni/);
  });

  it("returns failure when asset download !ok", async () => {
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("v3.4.0");
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 404,
      arrayBuffer: async () => new ArrayBuffer(0),
    } as unknown as Response);
    const res = await new NerdFontsProvider().update("FiraCode");
    expect(res.success).toBe(false);
    expect(res.message).toMatch(/Asset introuvable.*404/);
  });

  it("returns failure when fetch throws", async () => {
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("v3.4.0");
    fetchMock.mockRejectedValueOnce(new Error("ECONNRESET"));
    const res = await new NerdFontsProvider().update("FiraCode");
    expect(res.success).toBe(false);
    expect(res.message).toMatch(/ECONNRESET/);
  });

  it("returns failure when fetch throws non-Error", async () => {
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("v3.4.0");
    fetchMock.mockImplementationOnce(() => {
      throw "string-error"; // eslint-disable-line @typescript-eslint/no-throw-literal
    });
    const res = await new NerdFontsProvider().update("FiraCode");
    expect(res.success).toBe(false);
    expect(res.message).toMatch(/string-error/);
  });

  it("returns failure when archive contains no NerdFont entries", async () => {
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("v3.4.0");
    fetchMock.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8),
    } as unknown as Response);
    setZip(() => ({
      getEntries: () => [
        { isDirectory: false, entryName: "readme.txt", getData: () => Buffer.from("") },
        { isDirectory: true, entryName: "fonts/" },
      ],
    }));
    const res = await new NerdFontsProvider().update("FiraCode");
    expect(res.success).toBe(false);
    expect(res.message).toMatch(/Aucun fichier/);
  });

  it("returns failure when HKCU registration fails (runInherit failed)", async () => {
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("v3.4.0");
    fetchMock.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8),
    } as unknown as Response);
    setZip(() => ({
      getEntries: () => [
        {
          isDirectory: false,
          entryName: "FiraCodeNerdFont-Regular.ttf",
          getData: () => Buffer.from("ttf-bytes"),
        },
        {
          isDirectory: false,
          entryName: "subdir/FiraCodeNerdFontMono-Bold.otf",
          getData: () => Buffer.from("otf-bytes"),
        },
      ],
    }));
    runInheritMock.mockResolvedValueOnce(mkRun("", true));
    const res = await new NerdFontsProvider().update("FiraCode");
    expect(res.success).toBe(false);
    expect(res.message).toMatch(/HKCU/);
    expect(runInheritMock).toHaveBeenCalledTimes(1);
  });

  it("writes lockfile and reports success on the happy path", async () => {
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("v3.4.0");
    fetchMock.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8),
    } as unknown as Response);
    setZip(() => ({
      getEntries: () => [
        {
          isDirectory: false,
          entryName: "FiraCodeNerdFont-Regular.ttf",
          getData: () => Buffer.from("ttf-bytes"),
        },
      ],
    }));
    // First runInherit = HKCU registration (success)
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    // Lockfile previously had an unrelated entry
    existsSyncMock.mockImplementation((p: string) => p.endsWith("nerd-fonts.json"));
    readFileMock.mockResolvedValueOnce(JSON.stringify({ Meslo: "v3.3.0" }));

    const res = await new NerdFontsProvider().update("FiraCode");
    expect(res).toEqual({ id: "FiraCode", success: true });

    // Lockfile write captured with merged content
    expect(writeFileMock).toHaveBeenCalled();
    const lockWrite = writeFileMock.mock.calls.find((c) =>
      String(c[0]).endsWith("nerd-fonts.json"),
    );
    expect(lockWrite).toBeDefined();
    expect(String(lockWrite![1])).toContain("FiraCode");
    expect(String(lockWrite![1])).toContain("v3.4.0");
    expect(String(lockWrite![1])).toContain("Meslo");
  });

  it("returns generic failure message on unexpected sync throw inside the try block", async () => {
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("v3.4.0");
    fetchMock.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8),
    } as unknown as Response);
    setZipThrow(new Error("zip-broken"));
    const res = await new NerdFontsProvider().update("FiraCode");
    expect(res.success).toBe(false);
    expect(res.message).toBe("zip-broken");
  });

  it("returns failure with stringified non-Error from try block", async () => {
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("v3.4.0");
    fetchMock.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8),
    } as unknown as Response);
    setZipThrow("thing-broke");
    const res = await new NerdFontsProvider().update("FiraCode");
    expect(res.message).toBe("thing-broke");
  });

  it("succeeds with .otf extension producing 'OpenType' suffix in HKCU script", async () => {
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("v3.4.0");
    fetchMock.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8),
    } as unknown as Response);
    setZip(() => ({
      getEntries: () => [
        {
          isDirectory: false,
          entryName: "FiraCodeNerdFont-Regular.otf",
          getData: () => Buffer.from("bytes"),
        },
      ],
    }));
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new NerdFontsProvider().update("FiraCode");
    expect(res.success).toBe(true);
    const args = runInheritMock.mock.calls[0]![1] as string[];
    const script = args[args.length - 1]!;
    expect(script).toContain("(OpenType)");
  });

  it("rejects update when LOCALAPPDATA is missing", async () => {
    delete process.env["LOCALAPPDATA"];
    const res = await new NerdFontsProvider().update("FiraCode");
    expect(res.success).toBe(false);
    expect(res.message).toMatch(/Windows-only/);
  });

  it("swallows tmp-cleanup errors in the finally block", async () => {
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("v3.4.0");
    fetchMock.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8),
    } as unknown as Response);
    setZip(() => ({
      getEntries: () => [
        {
          isDirectory: false,
          entryName: "FiraCodeNerdFont-Regular.ttf",
          getData: () => Buffer.from("bytes"),
        },
      ],
    }));
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    rmMock.mockRejectedValueOnce(new Error("EBUSY"));
    const res = await new NerdFontsProvider().update("FiraCode");
    expect(res).toEqual({ id: "FiraCode", success: true });
  });
});

describe("NerdFontsProvider.updateAll", () => {
  it("returns [] for empty input", async () => {
    await expect(new NerdFontsProvider().updateAll([])).resolves.toEqual([]);
  });

  it("iterates over packages and returns outcomes in order", async () => {
    fetchGitHubReleaseLatestMock.mockResolvedValue(null);
    const res = await new NerdFontsProvider().updateAll([
      { id: "FiraCode" } as never,
      { id: "Meslo" } as never,
    ]);
    expect(res).toHaveLength(2);
    expect(res[0]?.id).toBe("FiraCode");
    expect(res[1]?.id).toBe("Meslo");
    expect(res.every((r) => r.success === false)).toBe(true);
  });
});
