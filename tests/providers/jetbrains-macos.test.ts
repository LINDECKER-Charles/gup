import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * macOS half of the JetBrains provider. Before this existed the provider only
 * ever probed %LOCALAPPDATA%/Program Files, so it was structurally blind on a
 * Mac — no IDE could ever be reported. These tests pin the three pieces that
 * make it work: the darwin candidate roots, the `.app` bundle walk (including
 * the pruning that stops it from descending into every unrelated bundle in
 * /Applications), and Caskroom/Toolbox source detection through realpath.
 */

const { runPmUpdateMock, describeSourceMock } = vi.hoisted(() => ({
  runPmUpdateMock: vi.fn(),
  describeSourceMock: vi.fn(),
}));

vi.mock("../../src/core/install-source.js", () => ({
  runPmUpdate: runPmUpdateMock,
  describeSource: describeSourceMock,
}));

const { existsSyncMock } = vi.hoisted(() => ({ existsSyncMock: vi.fn() }));

vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  return { ...actual, existsSync: existsSyncMock };
});

const { readFileMock, readdirMock, statMock, realpathMock } = vi.hoisted(() => ({
  readFileMock: vi.fn(),
  readdirMock: vi.fn(),
  statMock: vi.fn(),
  realpathMock: vi.fn(),
}));

vi.mock("node:fs/promises", async () => {
  const actual =
    await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
  return {
    ...actual,
    readFile: readFileMock,
    readdir: readdirMock,
    stat: statMock,
    realpath: realpathMock,
  };
});

import {
  JetBrainsProvider,
  detectSourceFromPath,
} from "../../src/providers/ide/jetbrains.js";

const HOME = "/Users/me";
const APPS = "/Applications";
const BUNDLE = `${APPS}/WebStorm.app`;
const RESOURCES = `${BUNDLE}/Contents/Resources`;
const CASKROOM_RESOURCES =
  "/opt/homebrew/Caskroom/webstorm/2024.1.0/WebStorm.app/Contents/Resources";

const PRODUCT_INFO = JSON.stringify({
  name: "WebStorm",
  version: "2024.1.0",
  buildNumber: "241.1000.1",
  productCode: "WS",
});

const ORIGINAL_PLATFORM = process.platform;
const ORIGINAL_ENV = { ...process.env };

function setPlatform(value: NodeJS.Platform): void {
  Object.defineProperty(process, "platform", { value, configurable: true });
}

let fetchMock: ReturnType<typeof vi.fn>;

const jsonResponse = (body: unknown, ok = true) =>
  ({ ok, json: async () => body }) as unknown as Response;

/**
 * Filesystem shaped like a single cask-installed WebStorm in /Applications,
 * plus an unrelated bundle that must never be descended into.
 */
function mockMacFilesystem(): void {
  existsSyncMock.mockImplementation((p: string) => p === APPS);

  readdirMock.mockImplementation(async (p: string) => {
    if (p === APPS) return ["WebStorm.app", "Xcode.app"];
    if (p === BUNDLE || p === `${APPS}/Xcode.app`) return ["Contents"];
    if (p === `${BUNDLE}/Contents`) return ["Resources", "MacOS", "Frameworks"];
    if (p === `${APPS}/Xcode.app/Contents`) return ["Resources", "Developer"];
    return [];
  });

  statMock.mockResolvedValue({ isDirectory: () => true });

  readFileMock.mockImplementation(async (p: string) => {
    if (p === `${RESOURCES}/product-info.json`) return PRODUCT_INFO;
    throw new Error("ENOENT");
  });

  // A cask install: the bundle in /Applications is a symlink into Caskroom.
  realpathMock.mockImplementation(async (p: string) =>
    p === RESOURCES ? CASKROOM_RESOURCES : p,
  );
}

beforeEach(() => {
  runPmUpdateMock.mockReset();
  describeSourceMock.mockReset();
  describeSourceMock.mockImplementation((s: string) =>
    s === "manual" ? "manuel" : `via ${s}`,
  );
  existsSyncMock.mockReset();
  readFileMock.mockReset();
  readdirMock.mockReset();
  statMock.mockReset();
  realpathMock.mockReset();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);

  setPlatform("darwin");
  process.env["HOME"] = HOME;
  delete process.env["LOCALAPPDATA"];
  delete process.env["USERPROFILE"];
});

afterEach(() => {
  vi.unstubAllGlobals();
  setPlatform(ORIGINAL_PLATFORM);
  process.env = { ...ORIGINAL_ENV };
});

describe("detectSourceFromPath — macOS", () => {
  it("recognises a Toolbox install under Application Support", () => {
    expect(
      detectSourceFromPath(
        "/Users/me/Library/Application Support/JetBrains/Toolbox/apps/WebStorm/ch-0/241/WebStorm.app",
      ),
    ).toBe("toolbox");
  });

  it("recognises a cask install through the Caskroom segment", () => {
    expect(detectSourceFromPath(CASKROOM_RESOURCES)).toBe("brew");
    expect(
      detectSourceFromPath("/usr/local/Caskroom/goland/2024.1/GoLand.app"),
    ).toBe("brew");
  });

  it("falls back to manual for a hand-dropped bundle", () => {
    expect(detectSourceFromPath("/Applications/WebStorm.app")).toBe("manual");
  });

  it("still classifies the Windows layouts exactly as before", () => {
    expect(
      detectSourceFromPath(
        "C:\\Users\\me\\AppData\\Local\\JetBrains\\Toolbox\\apps\\WebStorm\\ch-0\\241",
      ),
    ).toBe("toolbox");
    expect(detectSourceFromPath("C:\\Users\\me\\scoop\\apps\\webstorm\\current")).toBe(
      "scoop",
    );
    expect(detectSourceFromPath("C:\\ProgramData\\chocolatey\\lib\\webstorm")).toBe(
      "choco",
    );
    expect(
      detectSourceFromPath("C:\\Users\\me\\AppData\\Local\\Programs\\WebStorm"),
    ).toBe("winget");
  });
});

describe("JetBrainsProvider.isAvailable — macOS", () => {
  it("detects /Applications as a candidate root", async () => {
    existsSyncMock.mockImplementation((p: string) => p === APPS);
    await expect(new JetBrainsProvider().isAvailable()).resolves.toBe(true);
  });

  it("detects the Toolbox root under Application Support", async () => {
    existsSyncMock.mockImplementation(
      (p: string) =>
        p === `${HOME}/Library/Application Support/JetBrains/Toolbox/apps`,
    );
    await expect(new JetBrainsProvider().isAvailable()).resolves.toBe(true);
  });

  it("returns false when no macOS root exists", async () => {
    existsSyncMock.mockReturnValue(false);
    await expect(new JetBrainsProvider().isAvailable()).resolves.toBe(false);
  });

  it("never probes a Windows root on darwin", async () => {
    existsSyncMock.mockReturnValue(false);
    process.env["LOCALAPPDATA"] = "C:\\Users\\me\\AppData\\Local";
    await new JetBrainsProvider().isAvailable();
    const probed = existsSyncMock.mock.calls.map((c) => c[0] as string);
    expect(probed.some((p) => p.includes("C:\\"))).toBe(false);
    expect(probed).toContain(APPS);
  });
});

describe("JetBrainsProvider.listOutdated — macOS", () => {
  it("reads product-info.json inside the .app bundle and reports the update", async () => {
    mockMacFilesystem();
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ WS: [{ build: "242.2000.1", version: "2024.2.0", type: "release" }] }),
    );

    const rows = await new JetBrainsProvider().listOutdated();
    expect(rows).toEqual([
      {
        id: "WS",
        name: "WebStorm",
        current: "2024.1.0",
        latest: "2024.2.0",
        note: "via brew",
      },
    ]);
  });

  it("resolves the bundle through realpath before classifying the source", async () => {
    mockMacFilesystem();
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ WS: [{ build: "242.2000.1", version: "2024.2.0", type: "release" }] }),
    );
    await new JetBrainsProvider().listOutdated();
    expect(realpathMock).toHaveBeenCalledWith(RESOURCES);
  });

  it("flags a hand-installed bundle as manual", async () => {
    mockMacFilesystem();
    // No symlink: the bundle really lives in /Applications.
    realpathMock.mockImplementation(async (p: string) => p);
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ WS: [{ build: "242.2000.1", version: "2024.2.0", type: "release" }] }),
    );

    const rows = await new JetBrainsProvider().listOutdated();
    expect(rows[0]).toMatchObject({ manual: true, note: "manuel" });
  });

  it("does not descend past Contents/Resources inside a bundle", async () => {
    mockMacFilesystem();
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ WS: [{ build: "242.2000.1", version: "2024.2.0", type: "release" }] }),
    );
    await new JetBrainsProvider().listOutdated();

    const walked = readdirMock.mock.calls.map((c) => c[0] as string);
    // MacOS/ and Frameworks/ are siblings of Resources inside the bundle;
    // descending into them (and into Xcode's Developer tree) is what made a
    // naive /Applications scan unusable.
    expect(walked).not.toContain(`${BUNDLE}/Contents/MacOS`);
    expect(walked).not.toContain(`${BUNDLE}/Contents/Frameworks`);
    expect(walked).not.toContain(`${APPS}/Xcode.app/Contents/Developer`);
    expect(walked).toContain(RESOURCES);
  });

  it("tolerates a realpath failure and keeps the unresolved path", async () => {
    mockMacFilesystem();
    realpathMock.mockRejectedValue(new Error("EACCES"));
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ WS: [{ build: "242.2000.1", version: "2024.2.0", type: "release" }] }),
    );
    const rows = await new JetBrainsProvider().listOutdated();
    expect(rows[0]).toMatchObject({ id: "WS", manual: true });
  });
});

describe("JetBrainsProvider.update — macOS", () => {
  beforeEach(() => {
    mockMacFilesystem();
  });

  it("delegates a cask install to runPmUpdate with the brew source", async () => {
    runPmUpdateMock.mockResolvedValueOnce({ id: "WS", success: true });
    const res = await new JetBrainsProvider().update("WS");
    expect(res).toEqual({ id: "WS", success: true });

    const [id, source, packageIds] = runPmUpdateMock.mock.calls[0]!;
    expect(id).toBe("WS");
    expect(source).toBe("brew");
    // The cask token is what makes runPmUpdate pick `brew upgrade --cask`;
    // the Windows ids must still travel alongside it, untouched.
    expect(packageIds).toEqual({
      winget: "JetBrains.WebStorm",
      scoop: "webstorm",
      choco: "webstorm",
      brewCask: "webstorm",
    });
  });

  it("still skips a Toolbox-managed IDE on macOS", async () => {
    realpathMock.mockImplementation(async (p: string) =>
      p === RESOURCES
        ? `${HOME}/Library/Application Support/JetBrains/Toolbox/apps/WebStorm/ch-0/241/WebStorm.app/Contents/Resources`
        : p,
    );
    const res = await new JetBrainsProvider().update("WS");
    expect(res.skipped).toBe(true);
    expect(runPmUpdateMock).not.toHaveBeenCalled();
  });

  it("returns the download URL for a hand-installed bundle", async () => {
    realpathMock.mockImplementation(async (p: string) => p);
    const res = await new JetBrainsProvider().update("WS");
    expect(res.skipped).toBe(true);
    expect(res.message).toMatch(/jetbrains\.com\/webstorm\/download/);
    expect(runPmUpdateMock).not.toHaveBeenCalled();
  });
});
