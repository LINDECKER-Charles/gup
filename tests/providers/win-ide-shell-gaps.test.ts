import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Three Windows-leaning gap providers:
 *  - `visual-studio` — vswhere instance enumeration + the Release channel
 *    manifest, updated through the documented `setup.exe update` verb,
 *  - `psresource` — PSResourceGet scan/update driven through a PowerShell host,
 *  - `git-for-windows` — the `.windows.<patchlevel>` discriminator, with
 *    ownership-first delegation to scoop/choco/winget.
 */

const { commandExistsMock, runMock, runInheritMock, isElevatedMock } = vi.hoisted(
  () => ({
    commandExistsMock: vi.fn(),
    runMock: vi.fn(),
    runInheritMock: vi.fn(),
    isElevatedMock: vi.fn(),
  }),
);

vi.mock("../../src/core/runner.js", () => ({
  commandExists: commandExistsMock,
  run: runMock,
  runInherit: runInheritMock,
  isElevated: isElevatedMock,
  whichFirst: vi.fn(),
}));

const { describeSourceMock, detectInstallSourceMock, runPmUpdateMock } = vi.hoisted(
  () => ({
    describeSourceMock: vi.fn(),
    detectInstallSourceMock: vi.fn(),
    runPmUpdateMock: vi.fn(),
  }),
);

vi.mock("../../src/core/install-source.js", () => ({
  describeSource: describeSourceMock,
  detectInstallSource: detectInstallSourceMock,
  runPmUpdate: runPmUpdateMock,
  delegateUpdate: vi.fn(),
}));

const { fetchGitHubReleaseLatestMock } = vi.hoisted(() => ({
  fetchGitHubReleaseLatestMock: vi.fn(),
}));

vi.mock("../../src/core/gh-releases.js", async () => {
  const actual =
    await vi.importActual<typeof import("../../src/core/gh-releases.js")>(
      "../../src/core/gh-releases.js",
    );
  return { ...actual, fetchGitHubReleaseLatest: fetchGitHubReleaseLatestMock };
});

const { existsSyncMock } = vi.hoisted(() => ({ existsSyncMock: vi.fn() }));
vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  return { ...actual, existsSync: existsSyncMock };
});

const { tmpdirMock } = vi.hoisted(() => ({ tmpdirMock: vi.fn(() => "C:\\Temp") }));
vi.mock("node:os", async () => {
  const actual = await vi.importActual<typeof import("node:os")>("node:os");
  return { ...actual, tmpdir: tmpdirMock };
});

import {
  VisualStudioProvider,
  outdatedRow,
  parseChannelVersions,
  parseVswhereInstances,
  vsInstallerOutcome,
  type ChannelVersions,
  type VsInstance,
} from "../../src/providers/ide/visual-studio.js";
import {
  PsResourceProvider,
  parsePsResourceOutdated,
} from "../../src/providers/shell/psresource.js";
import {
  GitForWindowsProvider,
  compareGitForWindowsVersions,
  parseGitForWindowsVersion,
} from "../../src/providers/dev-cli/git-for-windows.js";

function mkRun(stdout: string, failed = false, stderr = "") {
  return { stdout, stderr, exitCode: failed ? 1 : 0, failed };
}

function mkExit(exitCode: number) {
  return { stdout: "", stderr: "", exitCode, failed: exitCode !== 0 };
}

function jsonResponse(payload: unknown, ok = true): Response {
  return { ok, json: async () => payload } as unknown as Response;
}

function brokenJsonResponse(): Response {
  return {
    ok: true,
    json: async () => {
      throw new SyntaxError("Unexpected token < in JSON at position 0");
    },
  } as unknown as Response;
}

const ORIGINAL_PLATFORM = process.platform;

function setPlatform(value: NodeJS.Platform): void {
  Object.defineProperty(process, "platform", { value, configurable: true });
}

// installerDirs() reads these four spellings; every test owns their values.
const PROGRAM_FILES_KEYS = [
  "ProgramFiles(x86)",
  "PROGRAMFILES(X86)",
  "ProgramFiles",
  "PROGRAMFILES",
] as const;

let savedEnv: Record<string, string | undefined> = {};
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  commandExistsMock.mockReset();
  runMock.mockReset();
  runInheritMock.mockReset();
  isElevatedMock.mockReset();
  describeSourceMock.mockReset();
  detectInstallSourceMock.mockReset();
  runPmUpdateMock.mockReset();
  fetchGitHubReleaseLatestMock.mockReset();
  existsSyncMock.mockReset();
  tmpdirMock.mockReset();
  tmpdirMock.mockReturnValue("C:\\Temp");

  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

  savedEnv = {};
  for (const key of PROGRAM_FILES_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  vi.unstubAllGlobals();
  setPlatform(ORIGINAL_PLATFORM);
  for (const key of PROGRAM_FILES_KEYS) {
    const value = savedEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

// ===========================================================================
// Visual Studio
// ===========================================================================

const VS_INSTALLER_DIR =
  "C:\\Program Files (x86)\\Microsoft Visual Studio\\Installer";
const VSWHERE_EXE = `${VS_INSTALLER_DIR}\\vswhere.exe`;
const VS_SETUP_EXE = `${VS_INSTALLER_DIR}\\setup.exe`;

const VSWHERE_ARGS = ["-all", "-products", "*", "-format", "json", "-utf8"];

const COMMUNITY_PATH =
  "C:\\Program Files\\Microsoft Visual Studio\\2022\\Community";
const BUILDTOOLS_PATH =
  "C:\\Program Files (x86)\\Microsoft Visual Studio\\2022\\BuildTools";

/** Shape of a real `vswhere -all -products * -format json -utf8` entry. */
function vsInstance(overrides: Partial<VsInstance> = {}): VsInstance {
  return {
    instanceId: "a1f2b3c4",
    installDate: "2024-11-12T08:31:10Z",
    installationName: "VisualStudio/17.14.7+35931.197",
    installationPath: COMMUNITY_PATH,
    installationVersion: "17.14.35931.197",
    productId: "Microsoft.VisualStudio.Product.Community",
    displayName: "Visual Studio Community 2022",
    isPrerelease: false,
    catalog: {
      buildVersion: "17.14.35931.197",
      productDisplayVersion: "17.14.7",
      productLineVersion: "2022",
    },
    ...overrides,
  } as VsInstance;
}

/** `https://aka.ms/vs/17/release/channel` payload, trimmed to what we read. */
function channelManifest(
  display = "17.14.9",
  build = "17.14.36301.6",
): Record<string, unknown> {
  return {
    manifestVersion: "1.1",
    info: {
      id: "VisualStudio.17.Release",
      buildBranch: "d17.14",
      buildVersion: build,
      manifestName: "VisualStudio",
      manifestType: "channel",
      productDisplayVersion: display,
      productLine: "Dev17",
      productLineVersion: "2022",
    },
    channelItems: [
      {
        id: "Microsoft.VisualStudio.Product.Community",
        version: build,
        type: "Product",
      },
      { id: "Microsoft.VisualStudio.Manifests.Setup", version: "1.0.0" },
    ],
  };
}

/** Windows host with the installer directory present and both exes on disk. */
function installedVs(files: string[] = [VSWHERE_EXE, VS_SETUP_EXE]): void {
  setPlatform("win32");
  process.env["ProgramFiles(x86)"] = "C:\\Program Files (x86)";
  existsSyncMock.mockImplementation((p: string) => files.includes(p));
}

describe("VisualStudioProvider.isAvailable", () => {
  it("never probes the filesystem off Windows", async () => {
    process.env["ProgramFiles(x86)"] = "C:\\Program Files (x86)";
    existsSyncMock.mockReturnValue(true);
    for (const platform of ["darwin", "linux"] as const) {
      setPlatform(platform);
      await expect(new VisualStudioProvider().isAvailable()).resolves.toBe(false);
    }
    expect(existsSyncMock).not.toHaveBeenCalled();
  });

  it("is available when vswhere.exe sits in the documented directory", async () => {
    installedVs();
    await expect(new VisualStudioProvider().isAvailable()).resolves.toBe(true);
    expect(existsSyncMock).toHaveBeenCalledWith(VSWHERE_EXE);
  });

  it("is unavailable when no %ProgramFiles% spelling is exported", async () => {
    setPlatform("win32");
    existsSyncMock.mockReturnValue(true);
    await expect(new VisualStudioProvider().isAvailable()).resolves.toBe(false);
    expect(existsSyncMock).not.toHaveBeenCalled();
  });

  it("is unavailable when the directory exists but vswhere.exe does not", async () => {
    installedVs([]);
    await expect(new VisualStudioProvider().isAvailable()).resolves.toBe(false);
  });

  it("probes every distinct spelling once and falls back to plain ProgramFiles", async () => {
    setPlatform("win32");
    // Both x86 spellings carry the same value — the dedup must collapse them.
    process.env["ProgramFiles(x86)"] = "C:\\Program Files (x86)";
    process.env["PROGRAMFILES(X86)"] = "C:\\Program Files (x86)";
    process.env["ProgramFiles"] = "C:\\Program Files";
    const found = "C:\\Program Files\\Microsoft Visual Studio\\Installer\\vswhere.exe";
    existsSyncMock.mockImplementation((p: string) => p === found);
    await expect(new VisualStudioProvider().isAvailable()).resolves.toBe(true);
    expect(existsSyncMock.mock.calls.map((c) => c[0])).toEqual([
      VSWHERE_EXE,
      found,
    ]);
  });
});

describe("parseVswhereInstances", () => {
  it("keeps entries carrying both an id and an install path", () => {
    const payload = JSON.stringify([vsInstance()]);
    const parsed = parseVswhereInstances(payload);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.instanceId).toBe("a1f2b3c4");
  });

  it("returns [] for a malformed JSON body rather than throwing", () => {
    expect(parseVswhereInstances("Not a valid vswhere payload")).toEqual([]);
    expect(parseVswhereInstances("")).toEqual([]);
    expect(parseVswhereInstances("[")).toEqual([]);
  });

  it("returns [] for the empty instance list vswhere prints on a clean box", () => {
    expect(parseVswhereInstances("[]")).toEqual([]);
  });

  it("returns [] when the payload is not an array", () => {
    expect(parseVswhereInstances(JSON.stringify({ instanceId: "x" }))).toEqual([]);
    expect(parseVswhereInstances("null")).toEqual([]);
  });

  it("drops null entries and entries missing an id or an install path", () => {
    const payload = JSON.stringify([
      null,
      "a string",
      { installationPath: COMMUNITY_PATH },
      { instanceId: "b1", installationPath: "" },
      { instanceId: "", installationPath: COMMUNITY_PATH },
      { instanceId: 42, installationPath: COMMUNITY_PATH },
      { instanceId: "ok", installationPath: COMMUNITY_PATH },
    ]);
    expect(parseVswhereInstances(payload).map((i) => i.instanceId)).toEqual(["ok"]);
  });
});

describe("parseChannelVersions", () => {
  it("reads both scales out of a Release manifest", () => {
    expect(parseChannelVersions(channelManifest())).toEqual({
      display: "17.14.9",
      build: "17.14.36301.6",
    });
  });

  it("strips the release-name suffix some manifests carry", () => {
    expect(
      parseChannelVersions({ info: { productDisplayVersion: "17.14.37 (July 2026)" } }),
    ).toEqual({ display: "17.14.37", build: null });
  });

  it("strips a trailing dot rather than emitting an unusable version", () => {
    expect(
      parseChannelVersions({ info: { productDisplayVersion: "17.14.9." } })?.display,
    ).toBe("17.14.9");
  });

  it("falls back to the product channel item when info carries no buildVersion", () => {
    expect(
      parseChannelVersions({
        info: { productDisplayVersion: "18.0.2" },
        channelItems: [
          null,
          { id: "Microsoft.VisualStudio.Manifests.Setup", version: "1.0.0" },
          { id: "Microsoft.VisualStudio.Product.Enterprise" },
          { version: "18.0.36000.1" },
          { id: "Microsoft.VisualStudio.Product.Community", version: "not-a-version" },
          { id: "Microsoft.VisualStudio.Product.Community", version: "18.0.36000.1" },
        ],
      }),
    ).toEqual({ display: "18.0.2", build: "18.0.36000.1" });
  });

  it("returns null when neither scale can be read", () => {
    expect(parseChannelVersions({})).toBeNull();
    expect(parseChannelVersions({ info: {}, channelItems: [] })).toBeNull();
    expect(parseChannelVersions({ info: { productDisplayVersion: ".5" } })).toBeNull();
    expect(parseChannelVersions({ channelItems: "nope" })).toBeNull();
  });

  it("returns null for anything that is not an object — the aka.ms search page case", () => {
    expect(parseChannelVersions(null)).toBeNull();
    expect(parseChannelVersions("<!DOCTYPE html>")).toBeNull();
    expect(parseChannelVersions(42)).toBeNull();
  });
});

describe("outdatedRow", () => {
  const channel: ChannelVersions = { display: "17.14.9", build: "17.14.36301.6" };

  it("emits an admin-gated row on the display scale", () => {
    expect(outdatedRow(vsInstance(), channel)).toEqual({
      id: "a1f2b3c4",
      name: "Visual Studio Community 2022",
      current: "17.14.7",
      latest: "17.14.9",
      note: "via l'installeur Visual Studio",
      requiresAdmin: true,
    });
  });

  it("falls back to the instance id when vswhere reports no display name", () => {
    const row = outdatedRow(vsInstance({ displayName: undefined }), channel);
    expect(row?.name).toBe("a1f2b3c4");
  });

  it("compares on the four-part build scale when the catalog is trimmed", () => {
    const row = outdatedRow(vsInstance({ catalog: undefined }), channel);
    expect(row).toMatchObject({
      current: "17.14.35931.197",
      latest: "17.14.36301.6",
    });
  });

  it("never mixes the scales — a display-less channel falls back to build", () => {
    // Real shape: a manifest whose `info` is trimmed, so only the
    // `Microsoft.VisualStudio.Product.*` channel item carries a version. The
    // instance still has a display version, and pairing it against the build
    // scale would compare 17.14.7 with 17.14.36301.6.
    const row = outdatedRow(vsInstance(), { display: null, build: "17.14.36301.6" });
    expect(row).toMatchObject({
      current: "17.14.35931.197",
      latest: "17.14.36301.6",
    });
  });

  it("drops Preview instances — they ride a channel we never read", () => {
    expect(outdatedRow(vsInstance({ isPrerelease: true }), channel)).toBeNull();
  });

  it("drops an instance with no id", () => {
    expect(outdatedRow(vsInstance({ instanceId: undefined }), channel)).toBeNull();
  });

  it("drops the row when neither scale lines up on both sides", () => {
    expect(
      outdatedRow(vsInstance({ catalog: undefined, installationVersion: undefined }), channel),
    ).toBeNull();
    expect(
      outdatedRow(vsInstance({ catalog: undefined }), { display: "17.14.9", build: null }),
    ).toBeNull();
  });

  it("never compares two product lines", () => {
    expect(
      outdatedRow(vsInstance(), { display: "18.0.1", build: "18.0.36000.1" }),
    ).toBeNull();
  });

  it("drops a current version with no product line at all", () => {
    const instance = vsInstance({ catalog: { productDisplayVersion: "17" } });
    expect(outdatedRow(instance, { display: "17", build: null })).toBeNull();
  });

  it("stays silent when the channel is equal to or behind the instance", () => {
    expect(outdatedRow(vsInstance(), { display: "17.14.7", build: null })).toBeNull();
    expect(outdatedRow(vsInstance(), { display: "17.14.6", build: null })).toBeNull();
  });

  it("orders numerically — 17.14.10 is newer than 17.14.9, and 17.14 predates 17.14.1", () => {
    const at9 = vsInstance({ catalog: { productDisplayVersion: "17.14.9" } });
    expect(outdatedRow(at9, { display: "17.14.10", build: null })?.latest).toBe(
      "17.14.10",
    );
    const short = vsInstance({ catalog: { productDisplayVersion: "17.14" } });
    expect(outdatedRow(short, { display: "17.14.1", build: null })?.latest).toBe(
      "17.14.1",
    );
    expect(outdatedRow(at9, { display: "17.14", build: null })).toBeNull();
  });
});

describe("VisualStudioProvider.listOutdated", () => {
  it("asks vswhere for every product and reports the behind instances", async () => {
    installedVs();
    runMock.mockResolvedValueOnce(mkRun(JSON.stringify([vsInstance()])));
    fetchMock.mockResolvedValueOnce(jsonResponse(channelManifest()));

    const rows = await new VisualStudioProvider().listOutdated();

    expect(runMock).toHaveBeenCalledWith(VSWHERE_EXE, VSWHERE_ARGS);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://aka.ms/vs/17/release/channel",
      expect.objectContaining({ headers: { accept: "application/json" } }),
    );
    // A scan slot must never be pinned by aka.ms: the request carries a deadline.
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(rows).toEqual([
      {
        id: "a1f2b3c4",
        name: "Visual Studio Community 2022",
        current: "17.14.7",
        latest: "17.14.9",
        note: "via l'installeur Visual Studio",
        requiresAdmin: true,
      },
    ]);
  });

  it("fetches one manifest per product line, whatever the instance count", async () => {
    installedVs();
    runMock.mockResolvedValueOnce(
      mkRun(
        JSON.stringify([
          vsInstance(),
          vsInstance({
            instanceId: "d4c3b2a1",
            displayName: "Visual Studio Build Tools 2022",
            installationPath: BUILDTOOLS_PATH,
          }),
          vsInstance({
            instanceId: "no-version",
            installationVersion: undefined,
            catalog: undefined,
          }),
        ]),
      ),
    );
    fetchMock.mockResolvedValue(jsonResponse(channelManifest()));

    const rows = await new VisualStudioProvider().listOutdated();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(rows.map((r) => r.id)).toEqual(["a1f2b3c4", "d4c3b2a1"]);
    expect(rows.every((r) => r.requiresAdmin === true)).toBe(true);
  });

  it("reads VS 2026 through the `stable` moniker instead of a per-major link", async () => {
    installedVs();
    runMock.mockResolvedValueOnce(
      mkRun(
        JSON.stringify([
          vsInstance({
            instanceId: "vs2026",
            displayName: "Visual Studio Enterprise 2026",
            installationVersion: "18.0.36000.1",
            catalog: { productDisplayVersion: "18.0.2" },
          }),
        ]),
      ),
    );
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ info: { productDisplayVersion: "18.0.3" } }),
    );

    const rows = await new VisualStudioProvider().listOutdated();

    expect(fetchMock).toHaveBeenCalledWith(
      "https://aka.ms/vs/stable/channel",
      expect.anything(),
    );
    expect(rows[0]).toMatchObject({ current: "18.0.2", latest: "18.0.3" });
  });

  it("issues one request per distinct product line, not one per instance", async () => {
    installedVs();
    runMock.mockResolvedValueOnce(
      mkRun(
        JSON.stringify([
          vsInstance(),
          vsInstance({
            instanceId: "vs2019",
            displayName: "Visual Studio Professional 2019",
            installationVersion: "16.11.35.0",
            installationPath:
              "C:\\Program Files (x86)\\Microsoft Visual Studio\\2019\\Professional",
            catalog: { productDisplayVersion: "16.11.35" },
          }),
        ]),
      ),
    );
    fetchMock.mockImplementation(async (url: string) =>
      url.includes("/vs/16/")
        ? jsonResponse({ info: { productDisplayVersion: "16.11.40" } })
        : jsonResponse(channelManifest()),
    );

    const rows = await new VisualStudioProvider().listOutdated();

    expect(fetchMock.mock.calls.map((c) => c[0] as string)).toEqual([
      "https://aka.ms/vs/17/release/channel",
      "https://aka.ms/vs/16/release/channel",
    ]);
    expect(rows.map((r) => [r.id, r.current, r.latest])).toEqual([
      ["a1f2b3c4", "17.14.7", "17.14.9"],
      ["vs2019", "16.11.35", "16.11.40"],
    ]);
  });

  it("keeps riding the `stable` moniker for a product line past 18", async () => {
    installedVs();
    runMock.mockResolvedValueOnce(
      mkRun(
        JSON.stringify([
          vsInstance({
            instanceId: "vs-next",
            installationVersion: "20.0.1.0",
            catalog: { productDisplayVersion: "20.0.1" },
          }),
        ]),
      ),
    );
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ info: { productDisplayVersion: "20.0.2" } }),
    );

    const rows = await new VisualStudioProvider().listOutdated();

    expect(fetchMock).toHaveBeenCalledWith(
      "https://aka.ms/vs/stable/channel",
      expect.anything(),
    );
    expect(rows[0]).toMatchObject({ current: "20.0.1", latest: "20.0.2" });
  });

  it("stays silent when `stable` has already moved to the next major", async () => {
    installedVs();
    runMock.mockResolvedValueOnce(
      mkRun(
        JSON.stringify([
          vsInstance({
            instanceId: "vs2026",
            installationVersion: "18.0.36000.1",
            catalog: { productDisplayVersion: "18.0.2" },
          }),
        ]),
      ),
    );
    // `stable` now serves VisualStudio.19.Release: the installer cannot move an
    // 18.x instance there, so no row must be produced.
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ info: { productDisplayVersion: "19.0.1" } }),
    );
    await expect(new VisualStudioProvider().listOutdated()).resolves.toEqual([]);
  });

  it("returns [] when vswhere is not installed at all", async () => {
    installedVs([]);
    await expect(new VisualStudioProvider().listOutdated()).resolves.toEqual([]);
    expect(runMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns [] when vswhere exits non-zero", async () => {
    installedVs();
    runMock.mockResolvedValueOnce(mkRun(JSON.stringify([vsInstance()]), true));
    await expect(new VisualStudioProvider().listOutdated()).resolves.toEqual([]);
    // A non-zero vswhere means the inventory is untrustworthy: its stdout must
    // not be parsed, and the network must never be touched on that basis.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns [] when run rejects instead of resolving", async () => {
    installedVs();
    runMock.mockRejectedValueOnce(new Error("unsafe command"));
    await expect(new VisualStudioProvider().listOutdated()).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns [] on a malformed vswhere payload", async () => {
    installedVs();
    runMock.mockResolvedValueOnce(mkRun("<html>proxy said no</html>"));
    await expect(new VisualStudioProvider().listOutdated()).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns [] when the channel manifest answers non-ok", async () => {
    installedVs();
    runMock.mockResolvedValueOnce(mkRun(JSON.stringify([vsInstance()])));
    fetchMock.mockResolvedValueOnce(jsonResponse({}, false));
    await expect(new VisualStudioProvider().listOutdated()).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns [] when aka.ms answers a 200 that is not JSON", async () => {
    installedVs();
    runMock.mockResolvedValueOnce(mkRun(JSON.stringify([vsInstance()])));
    fetchMock.mockResolvedValueOnce(brokenJsonResponse());
    await expect(new VisualStudioProvider().listOutdated()).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns [] when the network is down", async () => {
    installedVs();
    runMock.mockResolvedValueOnce(mkRun(JSON.stringify([vsInstance()])));
    fetchMock.mockRejectedValueOnce(new Error("ENOTFOUND"));
    await expect(new VisualStudioProvider().listOutdated()).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("caches a failed lookup so one dead channel costs one request", async () => {
    installedVs();
    runMock.mockResolvedValueOnce(
      mkRun(
        JSON.stringify([
          vsInstance(),
          vsInstance({ instanceId: "second", installationPath: BUILDTOOLS_PATH }),
        ]),
      ),
    );
    fetchMock.mockResolvedValueOnce(jsonResponse({}, false));
    await expect(new VisualStudioProvider().listOutdated()).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("vsInstallerOutcome", () => {
  it("treats 0 as a plain success", () => {
    expect(vsInstallerOutcome("i1", 0)).toEqual({ id: "i1", success: true });
  });

  it("treats the reboot codes as successes", () => {
    for (const code of [3010, 1641]) {
      expect(vsInstallerOutcome("i1", code)).toEqual({
        id: "i1",
        success: true,
        message: "Mise à jour effectuée — redémarrer pour finaliser.",
      });
    }
  });

  it("treats elevation and cancellation as deferrals, not failures", () => {
    expect(vsInstallerOutcome("i1", 740)).toEqual({
      id: "i1",
      success: false,
      skipped: true,
      message: expect.stringContaining("droits administrateur"),
    });
    for (const code of [1602, 5004, -1073741510]) {
      expect(vsInstallerOutcome("i1", code)).toEqual({
        id: "i1",
        success: false,
        skipped: true,
        message: "Mise à jour annulée.",
      });
    }
  });

  it("maps the documented failure codes to actionable messages", () => {
    expect(vsInstallerOutcome("i1", 1001).message).toMatch(/tourne déjà/);
    expect(vsInstallerOutcome("i1", 1003).message).toMatch(/en cours d'utilisation/);
    expect(vsInstallerOutcome("i1", 1618).message).toMatch(/autre installation/);
    expect(vsInstallerOutcome("i1", 5007).message).toMatch(/prérequis/);
    expect(vsInstallerOutcome("i1", 8006).message).toMatch(/processus/);
    expect(vsInstallerOutcome("i1", 8010).message).toMatch(/Système d'exploitation/);
    expect(vsInstallerOutcome("i1", -1073720687).message).toMatch(/réseau/);
  });

  it("fails without a message for a code Microsoft never documented", () => {
    expect(vsInstallerOutcome("i1", 4242)).toEqual({ id: "i1", success: false });
  });
});

describe("VisualStudioProvider.update", () => {
  it("spawns the documented update verb from outside the installer directory", async () => {
    installedVs();
    isElevatedMock.mockResolvedValue(true);
    runMock.mockResolvedValueOnce(mkRun(JSON.stringify([vsInstance()])));
    runInheritMock.mockResolvedValueOnce(mkExit(0));

    const res = await new VisualStudioProvider().update("a1f2b3c4");

    expect(runInheritMock).toHaveBeenCalledWith(
      VS_SETUP_EXE,
      ["update", "--passive", "--norestart", "--installPath", COMMUNITY_PATH],
      { cwd: "C:\\Temp" },
    );
    expect(res).toEqual({ id: "a1f2b3c4", success: true });
  });

  it("asks for a rescan when the instance id is unknown", async () => {
    installedVs();
    runMock.mockResolvedValueOnce(mkRun("[]"));
    const res = await new VisualStudioProvider().update("ghost");
    expect(res).toEqual({
      id: "ghost",
      success: false,
      message: "Instance Visual Studio introuvable — relancer le scan.",
    });
    expect(runInheritMock).not.toHaveBeenCalled();
  });

  it("asks for a rescan when the installer directory itself is gone", async () => {
    setPlatform("win32");
    process.env["ProgramFiles(x86)"] = "C:\\Program Files (x86)";
    existsSyncMock.mockReturnValue(false);
    const res = await new VisualStudioProvider().update("a1f2b3c4");
    expect(res).toEqual({
      id: "a1f2b3c4",
      success: false,
      message: "Instance Visual Studio introuvable — relancer le scan.",
    });
    expect(runMock).not.toHaveBeenCalled();
    expect(runInheritMock).not.toHaveBeenCalled();
  });

  it("skips when setup.exe is missing beside vswhere.exe", async () => {
    installedVs([VSWHERE_EXE]);
    runMock.mockResolvedValueOnce(mkRun(JSON.stringify([vsInstance()])));
    const res = await new VisualStudioProvider().update("a1f2b3c4");
    expect(res).toMatchObject({ success: false, skipped: true });
    expect(res.message).toMatch(/Installeur Visual Studio introuvable/);
    expect(isElevatedMock).not.toHaveBeenCalled();
  });

  it("skips without elevation instead of spawning a doomed installer", async () => {
    installedVs();
    isElevatedMock.mockResolvedValue(false);
    runMock.mockResolvedValueOnce(mkRun(JSON.stringify([vsInstance()])));
    const res = await new VisualStudioProvider().update("a1f2b3c4");
    expect(res).toMatchObject({ success: false, skipped: true });
    expect(res.message).toMatch(/droits administrateur/);
    expect(runInheritMock).not.toHaveBeenCalled();
  });

  it("reads a refusal to probe elevation as `not elevated`", async () => {
    installedVs();
    isElevatedMock.mockRejectedValue(new Error("whoami missing"));
    runMock.mockResolvedValueOnce(mkRun(JSON.stringify([vsInstance()])));
    const res = await new VisualStudioProvider().update("a1f2b3c4");
    expect(res).toMatchObject({ success: false, skipped: true });
    expect(runInheritMock).not.toHaveBeenCalled();
  });

  it("reports a spawn refusal as a failure rather than throwing", async () => {
    installedVs();
    isElevatedMock.mockResolvedValue(true);
    runMock.mockResolvedValueOnce(mkRun(JSON.stringify([vsInstance()])));
    runInheritMock.mockRejectedValueOnce(new Error("EPERM"));
    const res = await new VisualStudioProvider().update("a1f2b3c4");
    expect(res).toMatchObject({ id: "a1f2b3c4", success: false });
    expect(res.message).toMatch(/Impossible de lancer l'installeur/);
    expect(res.skipped).toBeUndefined();
  });

  it("maps the installer exit code through the documented table", async () => {
    installedVs();
    isElevatedMock.mockResolvedValue(true);
    runMock.mockResolvedValueOnce(mkRun(JSON.stringify([vsInstance()])));
    runInheritMock.mockResolvedValueOnce(mkExit(1001));
    const res = await new VisualStudioProvider().update("a1f2b3c4");
    expect(res).toMatchObject({ success: false });
    expect(res.message).toMatch(/tourne déjà/);
  });
});

describe("VisualStudioProvider.updateAll", () => {
  it("does nothing at all for an empty set", async () => {
    installedVs();
    await expect(new VisualStudioProvider().updateAll([])).resolves.toEqual([]);
    expect(runMock).not.toHaveBeenCalled();
    expect(runInheritMock).not.toHaveBeenCalled();
  });

  it("resolves the inventory once and runs the instances sequentially", async () => {
    installedVs();
    isElevatedMock.mockResolvedValue(true);
    runMock.mockResolvedValueOnce(
      mkRun(
        JSON.stringify([
          vsInstance(),
          vsInstance({ instanceId: "d4c3b2a1", installationPath: BUILDTOOLS_PATH }),
        ]),
      ),
    );
    runInheritMock
      .mockResolvedValueOnce(mkExit(0))
      .mockResolvedValueOnce(mkExit(3010));

    const res = await new VisualStudioProvider().updateAll([
      { id: "a1f2b3c4", current: "17.14.7", latest: "17.14.9" },
      { id: "d4c3b2a1", current: "17.14.7", latest: "17.14.9" },
      { id: "gone", current: "17.14.7", latest: "17.14.9" },
    ]);

    expect(runMock).toHaveBeenCalledTimes(1);
    expect(runInheritMock).toHaveBeenCalledTimes(2);
    expect(runInheritMock.mock.calls.map((c) => (c[1] as string[])[4])).toEqual([
      COMMUNITY_PATH,
      BUILDTOOLS_PATH,
    ]);
    expect(res).toEqual([
      { id: "a1f2b3c4", success: true },
      {
        id: "d4c3b2a1",
        success: true,
        message: "Mise à jour effectuée — redémarrer pour finaliser.",
      },
      {
        id: "gone",
        success: false,
        message: "Instance Visual Studio introuvable — relancer le scan.",
      },
    ]);
  });
});

// ===========================================================================
// PSResourceGet
// ===========================================================================

const HOST_ARGS = ["-NoProfile", "-NonInteractive", "-Command"];

function onlyShell(name: "pwsh" | "powershell" | null): void {
  commandExistsMock.mockImplementation(async (bin: string) => bin === name);
}

/** `Get-InstalledPSResource | ... | ConvertTo-Json -Compress` for one row. */
function psRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    Name: "Microsoft.PowerShell.SecretManagement",
    CurrentVersion: "1.1.2",
    LatestVersion: "1.2.0",
    Type: "Module",
    ...overrides,
  };
}

describe("PsResourceProvider.isAvailable", () => {
  it("prefers pwsh and probes the cmdlet itself, not just the host", async () => {
    onlyShell("pwsh");
    runMock.mockResolvedValueOnce(mkRun("yes\n"));
    await expect(new PsResourceProvider().isAvailable()).resolves.toBe(true);
    expect(runMock).toHaveBeenCalledWith(
      "pwsh",
      [...HOST_ARGS, expect.stringContaining("Get-Command Get-InstalledPSResource")],
      { timeout: 20_000 },
    );
  });

  it("falls back to Windows PowerShell when pwsh is absent", async () => {
    onlyShell("powershell");
    runMock.mockResolvedValueOnce(mkRun("yes"));
    await expect(new PsResourceProvider().isAvailable()).resolves.toBe(true);
    expect(runMock).toHaveBeenCalledWith("powershell", expect.any(Array), {
      timeout: 20_000,
    });
  });

  it("is unavailable when no PowerShell host is on PATH", async () => {
    onlyShell(null);
    await expect(new PsResourceProvider().isAvailable()).resolves.toBe(false);
    expect(runMock).not.toHaveBeenCalled();
  });

  it("is unavailable when the PATH probe itself blows up", async () => {
    commandExistsMock.mockRejectedValue(new Error("PATH exploded"));
    await expect(new PsResourceProvider().isAvailable()).resolves.toBe(false);
    expect(runMock).not.toHaveBeenCalled();
  });

  it("is unavailable on a host without PSResourceGet (PowerShell 5.1)", async () => {
    onlyShell("pwsh");
    runMock.mockResolvedValueOnce(mkRun("no"));
    await expect(new PsResourceProvider().isAvailable()).resolves.toBe(false);
  });

  it("is unavailable when the probe exits non-zero or refuses to spawn", async () => {
    onlyShell("pwsh");
    runMock.mockResolvedValueOnce(mkRun("yes", true));
    await expect(new PsResourceProvider().isAvailable()).resolves.toBe(false);
    runMock.mockRejectedValueOnce(new Error("spawn EACCES"));
    await expect(new PsResourceProvider().isAvailable()).resolves.toBe(false);
  });
});

describe("parsePsResourceOutdated", () => {
  it("accepts the bare object ConvertTo-Json emits for a single row", () => {
    expect(parsePsResourceOutdated(JSON.stringify(psRow()))).toEqual([
      {
        id: "Microsoft.PowerShell.SecretManagement",
        name: "Microsoft.PowerShell.SecretManagement",
        current: "1.1.2",
        latest: "1.2.0",
      },
    ]);
  });

  it("accepts the array shape and annotates scripts only", () => {
    const payload = JSON.stringify([
      psRow(),
      psRow({ Name: "Get-WindowsAutoPilotInfo", CurrentVersion: "3.9", LatestVersion: "3.10", Type: "Script" }),
      psRow({ Name: "SomePkg", CurrentVersion: "1.0.0", LatestVersion: "1.0.1", Type: "" }),
      psRow({ Name: "Nupkged", CurrentVersion: "1.0.0", LatestVersion: "1.0.1", Type: 7 }),
    ]);
    expect(parsePsResourceOutdated(payload)).toEqual([
      {
        id: "Microsoft.PowerShell.SecretManagement",
        name: "Microsoft.PowerShell.SecretManagement",
        current: "1.1.2",
        latest: "1.2.0",
      },
      {
        id: "Get-WindowsAutoPilotInfo",
        name: "Get-WindowsAutoPilotInfo",
        current: "3.9",
        latest: "3.10",
        note: "script",
      },
      { id: "SomePkg", name: "SomePkg", current: "1.0.0", latest: "1.0.1" },
      { id: "Nupkged", name: "Nupkged", current: "1.0.0", latest: "1.0.1" },
    ]);
  });

  it("returns [] for the nothing-to-do payloads", () => {
    expect(parsePsResourceOutdated("")).toEqual([]);
    expect(parsePsResourceOutdated("   \n  ")).toEqual([]);
    // ConvertTo-Json on an empty pipeline prints the literal `null`.
    expect(parsePsResourceOutdated("null")).toEqual([]);
    expect(parsePsResourceOutdated("[]")).toEqual([]);
  });

  it("returns [] on garbage rather than throwing", () => {
    expect(parsePsResourceOutdated("Find-PSResource : repository unreachable")).toEqual(
      [],
    );
    expect(parsePsResourceOutdated("{ unterminated")).toEqual([]);
  });

  it("drops rows missing any of the three mandatory fields", () => {
    const payload = JSON.stringify([
      { CurrentVersion: "1.0", LatestVersion: "2.0" },
      { Name: "A", LatestVersion: "2.0" },
      { Name: "B", CurrentVersion: "1.0" },
      { Name: "", CurrentVersion: "1.0", LatestVersion: "2.0" },
      { Name: "C", CurrentVersion: "", LatestVersion: "2.0" },
      { Name: "D", CurrentVersion: "1.0", LatestVersion: "" },
      { Name: "E", CurrentVersion: 1, LatestVersion: "2.0" },
      "not-an-object",
      null,
    ]);
    expect(parsePsResourceOutdated(payload)).toEqual([]);
  });

  it("orders numerically — 1.10.0 outranks 1.9.0", () => {
    const up = JSON.stringify(psRow({ CurrentVersion: "1.9.0", LatestVersion: "1.10.0" }));
    expect(parsePsResourceOutdated(up)).toHaveLength(1);
    const down = JSON.stringify(
      psRow({ CurrentVersion: "1.10.0", LatestVersion: "1.9.0" }),
    );
    expect(parsePsResourceOutdated(down)).toEqual([]);
  });

  it("treats a missing System.Version tail as zero, on either side", () => {
    expect(
      parsePsResourceOutdated(
        JSON.stringify(psRow({ CurrentVersion: "1.2", LatestVersion: "1.2.0.0" })),
      ),
    ).toEqual([]);
    expect(
      parsePsResourceOutdated(
        JSON.stringify(psRow({ CurrentVersion: "1.2.0.0", LatestVersion: "1.2" })),
      ),
    ).toEqual([]);
    expect(
      parsePsResourceOutdated(
        JSON.stringify(psRow({ CurrentVersion: "1.2.0.1", LatestVersion: "1.2" })),
      ),
    ).toEqual([]);
    expect(
      parsePsResourceOutdated(
        JSON.stringify(psRow({ CurrentVersion: "1.2", LatestVersion: "1.2.0.1" })),
      ),
    ).toHaveLength(1);
  });

  it("ranks a prerelease below its own release and never the reverse", () => {
    expect(
      parsePsResourceOutdated(
        JSON.stringify(psRow({ CurrentVersion: "2.3.0-beta1", LatestVersion: "2.3.0" })),
      ),
    ).toHaveLength(1);
    expect(
      parsePsResourceOutdated(
        JSON.stringify(psRow({ CurrentVersion: "2.3.0", LatestVersion: "2.3.0-beta1" })),
      ),
    ).toEqual([]);
  });

  it("never flags a row as needing elevation — updates land in CurrentUser", () => {
    const rows = parsePsResourceOutdated(JSON.stringify([psRow()]));
    expect(rows).toHaveLength(1);
    expect(rows.every((r) => r.requiresAdmin === undefined)).toBe(true);
  });

  it("drops a row whose two sides are the same string", () => {
    expect(
      parsePsResourceOutdated(
        JSON.stringify(psRow({ CurrentVersion: "1.2.0", LatestVersion: " 1.2.0 " })),
      ),
    ).toEqual([]);
    // The string check is the only thing standing between an unparseable
    // version and a permanent no-op row: `2024.09.beta` fails the numeric
    // parse on both sides, and the "keep what we could not re-parse" rule
    // below would otherwise offer an upgrade to the version already installed.
    expect(
      parsePsResourceOutdated(
        JSON.stringify(
          psRow({ CurrentVersion: "2024.09.beta", LatestVersion: " 2024.09.beta " }),
        ),
      ),
    ).toEqual([]);
  });

  it("keeps a row it merely failed to re-parse rather than hiding real work", () => {
    expect(
      parsePsResourceOutdated(
        JSON.stringify(psRow({ CurrentVersion: "cafe", LatestVersion: "babe" })),
      ),
    ).toHaveLength(1);
    expect(
      parsePsResourceOutdated(
        JSON.stringify(psRow({ CurrentVersion: "1.-2", LatestVersion: "1.3" })),
      ),
    ).toHaveLength(1);
  });
});

describe("PsResourceProvider.listOutdated", () => {
  it("runs the scan script on the selected host, generously bounded", async () => {
    onlyShell("pwsh");
    runMock.mockResolvedValueOnce(mkRun(JSON.stringify([psRow()])));
    const rows = await new PsResourceProvider().listOutdated();
    expect(runMock).toHaveBeenCalledWith(
      "pwsh",
      [...HOST_ARGS, expect.stringContaining("Get-InstalledPSResource")],
      { timeout: 180_000 },
    );
    expect(rows.map((r) => r.id)).toEqual([
      "Microsoft.PowerShell.SecretManagement",
    ]);
  });

  it("never asks the gallery for prereleases, and asks for compact JSON", async () => {
    onlyShell("pwsh");
    runMock.mockResolvedValueOnce(mkRun("null"));
    await expect(new PsResourceProvider().listOutdated()).resolves.toEqual([]);
    const script = (runMock.mock.calls[0]![1] as string[])[3]!;
    expect(script).toContain("Get-InstalledPSResource");
    expect(script).toContain("Find-PSResource");
    expect(script).toContain("ConvertTo-Json -Compress");
    // Out of scope by design: gup only ever offers the highest released version,
    // so the `-Prerelease` switch must appear on neither cmdlet.
    expect(script).not.toContain("-Prerelease");
  });

  it("keeps the rows that did come back when the host exited non-zero", async () => {
    onlyShell("powershell");
    runMock.mockResolvedValueOnce(mkRun(JSON.stringify(psRow()), true));
    await expect(new PsResourceProvider().listOutdated()).resolves.toHaveLength(1);
    expect(runMock).toHaveBeenCalledWith("powershell", expect.any(Array), {
      timeout: 180_000,
    });
  });

  it("returns [] when no host is available", async () => {
    onlyShell(null);
    await expect(new PsResourceProvider().listOutdated()).resolves.toEqual([]);
    expect(runMock).not.toHaveBeenCalled();
  });

  it("returns [] when the host refuses to spawn", async () => {
    onlyShell("pwsh");
    runMock.mockRejectedValueOnce(new Error("spawn ENOENT"));
    await expect(new PsResourceProvider().listOutdated()).resolves.toEqual([]);
  });

  it("returns [] on a malformed payload", async () => {
    onlyShell("pwsh");
    runMock.mockResolvedValueOnce(mkRun("ConvertTo-Json : the pipeline broke"));
    await expect(new PsResourceProvider().listOutdated()).resolves.toEqual([]);
    // The host did run — the empty list is a parse verdict, not a missing host.
    expect(runMock).toHaveBeenCalledTimes(1);
  });

  it("drops rows the gallery reports as not actually newer", async () => {
    onlyShell("pwsh");
    runMock.mockResolvedValueOnce(
      mkRun(
        JSON.stringify([
          psRow({ Name: "Behind", CurrentVersion: "1.9.0", LatestVersion: "1.10.0" }),
          psRow({ Name: "Level", CurrentVersion: "2.0", LatestVersion: "2.0.0.0" }),
          psRow({ Name: "Ahead", CurrentVersion: "3.1.0", LatestVersion: "3.0.9" }),
        ]),
      ),
    );
    await expect(new PsResourceProvider().listOutdated()).resolves.toEqual([
      { id: "Behind", name: "Behind", current: "1.9.0", latest: "1.10.0" },
    ]);
  });
});

describe("PsResourceProvider.update", () => {
  it("updates into the user scope, unattended, with the name single-quoted", async () => {
    onlyShell("pwsh");
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new PsResourceProvider().update("Az.Accounts");
    expect(res).toEqual({ id: "Az.Accounts", success: true });
    expect(runInheritMock).toHaveBeenCalledWith("pwsh", [
      ...HOST_ARGS,
      "Update-PSResource -Name 'Az.Accounts' -Scope CurrentUser -TrustRepository -AcceptLicense -Confirm:$false",
    ]);
  });

  it("doubles an embedded single quote — PowerShell's literal-string escape", async () => {
    onlyShell("powershell");
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    await new PsResourceProvider().update("Foo'Bar");
    const args = runInheritMock.mock.calls[0]![1] as string[];
    expect(args[args.length - 1]).toContain(
      "Update-PSResource -Name 'Foo''Bar' -Scope CurrentUser",
    );
    expect(runInheritMock).toHaveBeenCalledWith("powershell", expect.any(Array));
  });

  it("fails without spawning when no host is on PATH", async () => {
    onlyShell(null);
    const res = await new PsResourceProvider().update("Az.Accounts");
    expect(res).toEqual({
      id: "Az.Accounts",
      success: false,
      message: "Aucun hôte PowerShell trouvé sur le PATH.",
    });
    expect(runInheritMock).not.toHaveBeenCalled();
  });

  it("propagates a non-zero host exit as a plain failure", async () => {
    onlyShell("pwsh");
    runInheritMock.mockResolvedValueOnce(mkRun("", true));
    await expect(new PsResourceProvider().update("Az")).resolves.toEqual({
      id: "Az",
      success: false,
    });
  });

  it("describes a rejected spawn instead of throwing", async () => {
    onlyShell("pwsh");
    runInheritMock.mockRejectedValueOnce(new Error("EACCES"));
    const res = await new PsResourceProvider().update("Az");
    expect(res).toEqual({
      id: "Az",
      success: false,
      message: "Échec de la mise à jour PSResourceGet : EACCES",
    });
  });

  it("stringifies a non-Error rejection", async () => {
    onlyShell("pwsh");
    runInheritMock.mockRejectedValueOnce("boom");
    const res = await new PsResourceProvider().update("Az");
    expect(res.message).toBe("Échec de la mise à jour PSResourceGet : boom");
  });
});

describe("PsResourceProvider.updateAll", () => {
  it("does nothing for an empty set", async () => {
    await expect(new PsResourceProvider().updateAll([])).resolves.toEqual([]);
    expect(runInheritMock).not.toHaveBeenCalled();
    expect(commandExistsMock).not.toHaveBeenCalled();
  });

  it("walks the set in order, one resource at a time", async () => {
    onlyShell("pwsh");
    runInheritMock
      .mockResolvedValueOnce(mkRun(""))
      .mockResolvedValueOnce(mkRun("", true));
    const res = await new PsResourceProvider().updateAll([
      { id: "A", current: "1", latest: "2" },
      { id: "B", current: "1", latest: "2" },
    ]);
    expect(res).toEqual([
      { id: "A", success: true },
      { id: "B", success: false },
    ]);
    expect(runInheritMock).toHaveBeenCalledTimes(2);
    expect(runInheritMock.mock.calls.map((c) => (c[1] as string[])[3])).toEqual([
      "Update-PSResource -Name 'A' -Scope CurrentUser -TrustRepository -AcceptLicense -Confirm:$false",
      "Update-PSResource -Name 'B' -Scope CurrentUser -TrustRepository -AcceptLicense -Confirm:$false",
    ]);
  });

  it("fails only the rows left over when the host disappears mid-run", async () => {
    let probes = 0;
    commandExistsMock.mockImplementation(async (bin: string) => {
      probes += 1;
      return probes === 1 && bin === "pwsh";
    });
    runInheritMock.mockResolvedValueOnce(mkRun(""));

    const res = await new PsResourceProvider().updateAll([
      { id: "A", current: "1", latest: "2" },
      { id: "B", current: "1", latest: "2" },
    ]);

    expect(res).toEqual([
      { id: "A", success: true },
      {
        id: "B",
        success: false,
        message: "Aucun hôte PowerShell trouvé sur le PATH.",
      },
    ]);
    expect(runInheritMock).toHaveBeenCalledTimes(1);
  });
});

// ===========================================================================
// Git for Windows
// ===========================================================================

const GFW_MANUAL = "Télécharger l'installeur depuis https://gitforwindows.org/ et le relancer";
const GFW_PACKAGE_IDS = { scoop: "git", choco: "git", winget: "Git.Git" };
const UPDATER_BANNER =
  "usage: git update-git-for-windows [--gui] [--quiet] [--yes] [--test-callback=<shell-script>]";

interface GitRunSpec {
  version?: string;
  versionFailed?: boolean;
  versionThrows?: boolean;
  probeStdout?: string;
  probeStderr?: string;
  probeThrows?: boolean;
}

/** Dispatch `run("git", …)` by subcommand so ordering never matters. */
function stubGit(spec: GitRunSpec): void {
  runMock.mockImplementation(async (_cmd: string, args: string[]) => {
    if (args[0] === "--version") {
      if (spec.versionThrows) throw new Error("spawn ENOENT");
      return mkRun(spec.version ?? "", spec.versionFailed ?? false);
    }
    if (args[0] === "update-git-for-windows") {
      if (spec.probeThrows) throw new Error("spawn ENOENT");
      return mkRun(spec.probeStdout ?? "", false, spec.probeStderr ?? "");
    }
    throw new Error(`unexpected run: ${args.join(" ")}`);
  });
}

describe("GitForWindowsProvider.isAvailable", () => {
  it("never touches PATH off Windows", async () => {
    for (const platform of ["darwin", "linux"] as const) {
      setPlatform(platform);
      await expect(new GitForWindowsProvider().isAvailable()).resolves.toBe(false);
    }
    expect(commandExistsMock).not.toHaveBeenCalled();
    expect(runMock).not.toHaveBeenCalled();
  });

  it("is available for a genuine Git for Windows build", async () => {
    setPlatform("win32");
    commandExistsMock.mockResolvedValue(true);
    stubGit({ version: "git version 2.55.0.windows.3" });
    await expect(new GitForWindowsProvider().isAvailable()).resolves.toBe(true);
    expect(commandExistsMock).toHaveBeenCalledWith("git");
    expect(runMock).toHaveBeenCalledWith("git", ["--version"]);
  });

  it("rejects a git build that is not the Windows distribution", async () => {
    setPlatform("win32");
    commandExistsMock.mockResolvedValue(true);
    for (const version of [
      "git version 2.47.0",
      "git version 2.51.0.vfs.0.1",
      "git version 2.39.5 (Apple Git-154)",
    ]) {
      stubGit({ version });
      await expect(new GitForWindowsProvider().isAvailable()).resolves.toBe(false);
    }
  });

  it("is unavailable when git is not on PATH — and never runs it", async () => {
    setPlatform("win32");
    commandExistsMock.mockResolvedValue(false);
    await expect(new GitForWindowsProvider().isAvailable()).resolves.toBe(false);
    expect(runMock).not.toHaveBeenCalled();
  });

  it("is unavailable when the PATH probe rejects", async () => {
    setPlatform("win32");
    commandExistsMock.mockRejectedValue(new Error("PATH exploded"));
    await expect(new GitForWindowsProvider().isAvailable()).resolves.toBe(false);
    expect(runMock).not.toHaveBeenCalled();
  });

  it("is unavailable when `git --version` fails or refuses to spawn", async () => {
    setPlatform("win32");
    commandExistsMock.mockResolvedValue(true);
    stubGit({ version: "git version 2.55.0.windows.3", versionFailed: true });
    await expect(new GitForWindowsProvider().isAvailable()).resolves.toBe(false);
    stubGit({ versionThrows: true });
    await expect(new GitForWindowsProvider().isAvailable()).resolves.toBe(false);
  });
});

describe("parseGitForWindowsVersion", () => {
  it("returns the full tag-shaped token for a Git for Windows build", () => {
    expect(parseGitForWindowsVersion("git version 2.55.0.windows.3")).toBe(
      "2.55.0.windows.3",
    );
    expect(parseGitForWindowsVersion("GIT VERSION 2.47.1.windows.10\n")).toBe(
      "2.47.1.windows.10",
    );
  });

  it("parses both release-candidate separators", () => {
    expect(parseGitForWindowsVersion("git version 2.32.0-rc0.windows.1")).toBe(
      "2.32.0-rc0.windows.1",
    );
    expect(parseGitForWindowsVersion("git version 2.34.0.rc1.windows.1")).toBe(
      "2.34.0.rc1.windows.1",
    );
  });

  it("returns null for every other git that answers to the same name", () => {
    expect(parseGitForWindowsVersion("git version 2.47.0")).toBeNull();
    expect(parseGitForWindowsVersion("git version 2.51.0.vfs.0.1")).toBeNull();
    expect(
      parseGitForWindowsVersion("git version 2.45.1.windows.1.dirty"),
    ).toBeNull();
    expect(parseGitForWindowsVersion("git version .windows.1")).toBeNull();
    expect(parseGitForWindowsVersion("git version x.y.windows.1")).toBeNull();
    expect(parseGitForWindowsVersion("git version 2.55.0.windows.")).toBeNull();
  });

  it("matches the marker case-insensitively and keeps the token verbatim", () => {
    expect(parseGitForWindowsVersion("git version 2.55.0.WINDOWS.3")).toBe(
      "2.55.0.WINDOWS.3",
    );
  });

  it("returns null for blank and garbage input", () => {
    expect(parseGitForWindowsVersion("")).toBeNull();
    expect(parseGitForWindowsVersion("bash: git: command not found")).toBeNull();
    expect(parseGitForWindowsVersion("git version")).toBeNull();
  });
});

describe("compareGitForWindowsVersions", () => {
  it("orders the upstream version numerically, never lexicographically", () => {
    expect(
      compareGitForWindowsVersions("2.9.0.windows.1", "2.10.0.windows.1"),
    ).toBeLessThan(0);
    expect(
      compareGitForWindowsVersions("2.10.0.windows.1", "2.9.0.windows.1"),
    ).toBeGreaterThan(0);
  });

  it("orders the patchlevel numerically — .windows.10 after .windows.9", () => {
    expect(
      compareGitForWindowsVersions("2.55.0.windows.9", "2.55.0.windows.10"),
    ).toBeLessThan(0);
  });

  it("treats a missing upstream segment as zero, on either side", () => {
    expect(compareGitForWindowsVersions("2.55.windows.1", "2.55.0.windows.1")).toBe(0);
    expect(compareGitForWindowsVersions("2.55.0.windows.1", "2.55.windows.1")).toBe(0);
    expect(
      compareGitForWindowsVersions("2.55.windows.1", "2.55.1.windows.1"),
    ).toBeLessThan(0);
    expect(
      compareGitForWindowsVersions("2.55.1.windows.1", "2.55.windows.1"),
    ).toBeGreaterThan(0);
  });

  it("ranks a release candidate below the final release of the same core", () => {
    expect(
      compareGitForWindowsVersions("2.55.0-rc2.windows.1", "2.55.0.windows.1"),
    ).toBeLessThan(0);
    expect(
      compareGitForWindowsVersions("2.55.0.windows.1", "2.55.0-rc2.windows.1"),
    ).toBeGreaterThan(0);
    expect(
      compareGitForWindowsVersions("2.55.0-rc1.windows.1", "2.55.0-rc2.windows.1"),
    ).toBeLessThan(0);
    expect(
      compareGitForWindowsVersions("2.55.0-rc2.windows.1", "2.55.0-rc2.windows.1"),
    ).toBe(0);
  });

  it("returns 0 for the same build", () => {
    expect(
      compareGitForWindowsVersions("2.55.0.windows.3", "2.55.0.windows.3"),
    ).toBe(0);
  });

  it("returns null rather than inventing an answer for an unorderable side", () => {
    expect(compareGitForWindowsVersions("2.55.0", "2.55.0.windows.1")).toBeNull();
    expect(compareGitForWindowsVersions("2.55.0.windows.1", "garbage")).toBeNull();
  });
});

describe("GitForWindowsProvider.listOutdated", () => {
  it("names the built-in updater when nobody owns the installation", async () => {
    stubGit({
      version: "git version 2.55.0.windows.1",
      probeStdout: UPDATER_BANNER,
    });
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("2.55.0.windows.3");
    detectInstallSourceMock.mockResolvedValueOnce("manual");

    const rows = await new GitForWindowsProvider().listOutdated();

    expect(runMock).toHaveBeenCalledWith("git", ["--version"]);
    expect(fetchGitHubReleaseLatestMock).toHaveBeenCalledWith("git-for-windows/git");
    expect(detectInstallSourceMock).toHaveBeenCalledWith("git");
    expect(rows).toEqual([
      {
        id: "git-for-windows",
        name: "Git for Windows",
        current: "2.55.0.windows.1",
        latest: "2.55.0.windows.3",
        note: "via git update-git-for-windows",
      },
    ]);
  });

  it("probes the updater offline, bounded, and only for its usage banner", async () => {
    stubGit({
      version: "git version 2.55.0.windows.1",
      // Banner on stderr, shouted: the match must be case-insensitive and must
      // read both streams, because build-extra prints it through `printf` to
      // whichever stream the shell picked.
      probeStderr: "USAGE: GIT UPDATE-GIT-FOR-WINDOWS [--gui] [--yes]",
    });
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("2.55.0.windows.3");
    detectInstallSourceMock.mockResolvedValueOnce("manual");

    const rows = await new GitForWindowsProvider().listOutdated();

    expect(runMock).toHaveBeenCalledWith(
      "git",
      ["update-git-for-windows", "-h"],
      { timeout: 10_000 },
    );
    expect(rows[0]?.note).toBe("via git update-git-for-windows");
    // The probe must never be the thing that starts an installer.
    expect(runInheritMock).not.toHaveBeenCalled();
  });

  it("falls back to a manual wording when the built-in updater is absent (MinGit)", async () => {
    stubGit({
      version: "git version 2.55.0.windows.1",
      probeStdout: "git: 'update-git-for-windows' is not a git command.",
    });
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("2.55.0.windows.3");
    detectInstallSourceMock.mockResolvedValueOnce("manual");
    const rows = await new GitForWindowsProvider().listOutdated();
    expect(rows[0]?.note).toBe("installeur à relancer manuellement");
  });

  it("names the owning package manager and skips the updater probe", async () => {
    stubGit({ version: "git version 2.55.0.windows.1" });
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("2.55.0.windows.3");
    detectInstallSourceMock.mockResolvedValueOnce("scoop");
    describeSourceMock.mockReturnValueOnce("via scoop");

    const rows = await new GitForWindowsProvider().listOutdated();

    expect(rows[0]?.note).toBe("via scoop");
    expect(describeSourceMock).toHaveBeenCalledWith("scoop");
    expect(runMock).toHaveBeenCalledTimes(1);
  });

  it("returns [] when the installed git is not a Git for Windows build", async () => {
    stubGit({ version: "git version 2.47.0" });
    await expect(new GitForWindowsProvider().listOutdated()).resolves.toEqual([]);
    expect(fetchGitHubReleaseLatestMock).not.toHaveBeenCalled();
    expect(detectInstallSourceMock).not.toHaveBeenCalled();
  });

  it("returns [] when `git --version` fails or refuses to spawn", async () => {
    stubGit({ version: "git version 2.55.0.windows.1", versionFailed: true });
    await expect(new GitForWindowsProvider().listOutdated()).resolves.toEqual([]);
    stubGit({ versionThrows: true });
    await expect(new GitForWindowsProvider().listOutdated()).resolves.toEqual([]);
    expect(fetchGitHubReleaseLatestMock).not.toHaveBeenCalled();
  });

  it("returns [] when the upstream lookup returns null", async () => {
    stubGit({ version: "git version 2.55.0.windows.1" });
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce(null);
    await expect(new GitForWindowsProvider().listOutdated()).resolves.toEqual([]);
    expect(detectInstallSourceMock).not.toHaveBeenCalled();
  });

  it("returns [] when the installed build is current", async () => {
    stubGit({ version: "git version 2.55.0.windows.3" });
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("2.55.0.windows.3");
    await expect(new GitForWindowsProvider().listOutdated()).resolves.toEqual([]);
    // No row means no update path to describe: neither probe must have run.
    expect(detectInstallSourceMock).not.toHaveBeenCalled();
    expect(runMock).toHaveBeenCalledTimes(1);
  });

  it("returns [] when the installed build is ahead — the RC channel case", async () => {
    stubGit({ version: "git version 2.56.0-rc1.windows.1" });
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("2.55.0.windows.3");
    await expect(new GitForWindowsProvider().listOutdated()).resolves.toEqual([]);
    expect(detectInstallSourceMock).not.toHaveBeenCalled();
  });

  it("returns [] when the API hands back an unorderable tag", async () => {
    stubGit({ version: "git version 2.55.0.windows.1" });
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("nightly");
    await expect(new GitForWindowsProvider().listOutdated()).resolves.toEqual([]);
    expect(detectInstallSourceMock).not.toHaveBeenCalled();
  });

  it("returns [] rather than throwing when a dependency rejects", async () => {
    stubGit({ version: "git version 2.55.0.windows.1" });
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("2.55.0.windows.3");
    detectInstallSourceMock.mockRejectedValueOnce(new Error("where.exe missing"));
    await expect(new GitForWindowsProvider().listOutdated()).resolves.toEqual([]);
  });

  it("treats a probe that refuses to spawn as an absent updater", async () => {
    stubGit({ version: "git version 2.55.0.windows.1", probeThrows: true });
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("2.55.0.windows.3");
    detectInstallSourceMock.mockResolvedValueOnce("manual");
    const rows = await new GitForWindowsProvider().listOutdated();
    expect(rows[0]?.note).toBe("installeur à relancer manuellement");
  });
});

describe("GitForWindowsProvider.update", () => {
  it("hands the upgrade to the owning package manager", async () => {
    for (const source of ["scoop", "choco", "winget"] as const) {
      detectInstallSourceMock.mockResolvedValueOnce(source);
      runPmUpdateMock.mockResolvedValueOnce({ id: "git-for-windows", success: true });
      const res = await new GitForWindowsProvider().update("git-for-windows");
      expect(res).toEqual({ id: "git-for-windows", success: true });
      expect(runPmUpdateMock).toHaveBeenLastCalledWith(
        "git-for-windows",
        source,
        GFW_PACKAGE_IDS,
        GFW_MANUAL,
      );
    }
    expect(runInheritMock).not.toHaveBeenCalled();
  });

  it("falls back to the built-in updater only when nobody owns the binary", async () => {
    detectInstallSourceMock.mockResolvedValue("manual");
    stubGit({ probeStderr: UPDATER_BANNER });
    runInheritMock.mockResolvedValueOnce(mkExit(2));

    const res = await new GitForWindowsProvider().update("git-for-windows");

    expect(runPmUpdateMock).not.toHaveBeenCalled();
    expect(runInheritMock).toHaveBeenCalledWith("git", [
      "update-git-for-windows",
      "--yes",
    ]);
    expect(res).toEqual({
      id: "git-for-windows",
      success: true,
      message:
        "installeur lancé en arrière-plan — les sessions Git Bash ouvertes ont été fermées",
    });
  });

  it("skips when the built-in updater is not part of this installation", async () => {
    detectInstallSourceMock.mockResolvedValue("manual");
    stubGit({ probeStdout: "" });
    const res = await new GitForWindowsProvider().update("git-for-windows");
    expect(res).toMatchObject({ success: false, skipped: true });
    expect(res.message).toContain("updater intégré absent");
    expect(res.message).toContain(GFW_MANUAL);
    expect(runInheritMock).not.toHaveBeenCalled();
  });

  it("reports exit 0 as `nothing offered` rather than a failure", async () => {
    detectInstallSourceMock.mockResolvedValue("manual");
    stubGit({ probeStdout: UPDATER_BANNER });
    runInheritMock.mockResolvedValueOnce(mkExit(0));
    await expect(
      new GitForWindowsProvider().update("git-for-windows"),
    ).resolves.toEqual({
      id: "git-for-windows",
      success: true,
      message: "aucune mise à jour proposée par git",
    });
  });

  it("reads exit 1 as an updater too old to know --yes", async () => {
    detectInstallSourceMock.mockResolvedValue("manual");
    stubGit({ probeStdout: UPDATER_BANNER });
    runInheritMock.mockResolvedValueOnce(mkExit(1));
    const res = await new GitForWindowsProvider().update("git-for-windows");
    expect(res.success).toBe(false);
    expect(res.message).toContain("refusé l'option --yes");
  });

  it("surfaces any other exit code verbatim", async () => {
    detectInstallSourceMock.mockResolvedValue("manual");
    stubGit({ probeStdout: UPDATER_BANNER });
    runInheritMock.mockResolvedValueOnce(mkExit(127));
    const res = await new GitForWindowsProvider().update("git-for-windows");
    expect(res.success).toBe(false);
    expect(res.message).toContain("git update-git-for-windows a échoué (code 127)");
  });

  it("degrades to a generic failure when the updater refuses to spawn", async () => {
    detectInstallSourceMock.mockResolvedValue("manual");
    stubGit({ probeStdout: UPDATER_BANNER });
    runInheritMock.mockRejectedValueOnce(new Error("EPERM"));
    const res = await new GitForWindowsProvider().update("git-for-windows");
    expect(res).toEqual({
      id: "git-for-windows",
      success: false,
      message: `échec inattendu de la mise à jour — ${GFW_MANUAL}`,
    });
  });

  it("degrades to a generic failure when source detection rejects", async () => {
    detectInstallSourceMock.mockRejectedValueOnce(new Error("where.exe missing"));
    const res = await new GitForWindowsProvider().update("git-for-windows");
    expect(res.success).toBe(false);
    expect(res.message).toContain("échec inattendu");
  });
});

describe("GitForWindowsProvider.updateAll", () => {
  it("does nothing for an empty set", async () => {
    await expect(new GitForWindowsProvider().updateAll([])).resolves.toEqual([]);
    expect(detectInstallSourceMock).not.toHaveBeenCalled();
    expect(runInheritMock).not.toHaveBeenCalled();
  });

  it("collapses any row count into a single distribution-wide upgrade", async () => {
    detectInstallSourceMock.mockResolvedValue("winget");
    runPmUpdateMock.mockResolvedValueOnce({ id: "git-for-windows", success: true });
    const res = await new GitForWindowsProvider().updateAll([
      { id: "git-for-windows", current: "2.55.0.windows.1", latest: "2.55.0.windows.3" },
      { id: "git-for-windows", current: "2.55.0.windows.1", latest: "2.55.0.windows.3" },
    ]);
    expect(res).toEqual([{ id: "git-for-windows", success: true }]);
    expect(runPmUpdateMock).toHaveBeenCalledTimes(1);
  });
});
