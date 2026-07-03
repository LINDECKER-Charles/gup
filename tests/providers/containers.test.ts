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

const { delegateUpdateMock, detectInstallSourceMock, describeSourceMock } =
  vi.hoisted(() => ({
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
  normalizeVersion: (v: string) => v.trim().replace(/^v/i, "").toLowerCase(),
}));

const { existsSyncMock } = vi.hoisted(() => ({
  existsSyncMock: vi.fn(),
}));

vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  return {
    ...actual,
    existsSync: existsSyncMock,
  };
});

import { DiveProvider } from "../../src/providers/containers/dive.js";
import { DockerDesktopProvider } from "../../src/providers/containers/docker-desktop.js";
import { NerdctlProvider } from "../../src/providers/containers/nerdctl.js";
import { OrasProvider } from "../../src/providers/containers/oras.js";
import { PodmanDesktopProvider } from "../../src/providers/containers/podman-desktop.js";
import { RancherDesktopProvider } from "../../src/providers/containers/rancher-desktop.js";

function mkRun(stdout: string, failed = false) {
  return { stdout, stderr: "", exitCode: failed ? 1 : 0, failed };
}

const jsonResponse = (body: unknown, ok = true) =>
  ({ ok, json: async () => body }) as unknown as Response;

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  commandExistsMock.mockReset();
  runMock.mockReset();
  runInheritMock.mockReset();
  delegateUpdateMock.mockReset();
  detectInstallSourceMock.mockReset();
  describeSourceMock.mockReset();
  fetchGitHubReleaseLatestMock.mockReset();
  existsSyncMock.mockReset();
  detectInstallSourceMock.mockResolvedValue("scoop");
  describeSourceMock.mockImplementation((s: string) =>
    s === "manual" ? "manuel" : `via ${s}`,
  );
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// Generic GitHub-release-based providers (dive, nerdctl, oras)
// ---------------------------------------------------------------------------

interface GhSpec {
  name: string;
  Ctor: new () => {
    isAvailable(): Promise<boolean>;
    listOutdated(): Promise<unknown[]>;
    update(id: string): Promise<unknown>;
    updateAll(pkgs: unknown[]): Promise<unknown[]>;
  };
  binary: string;
  versionArg: string;
  versionStdout: (v: string) => string;
  unparsable: string;
  ownerRepo: string;
}

const ghSpecs: GhSpec[] = [
  {
    name: "dive",
    Ctor: DiveProvider,
    binary: "dive",
    versionArg: "--version",
    versionStdout: (v) => `dive ${v}`,
    unparsable: "no match here",
    ownerRepo: "wagoodman/dive",
  },
  {
    name: "nerdctl",
    Ctor: NerdctlProvider,
    binary: "nerdctl",
    versionArg: "--version",
    versionStdout: (v) => `nerdctl version ${v}`,
    unparsable: "header only",
    ownerRepo: "containerd/nerdctl",
  },
  {
    name: "oras",
    Ctor: OrasProvider,
    binary: "oras",
    versionArg: "version",
    versionStdout: (v) => `Version:        ${v}\nGo version:     go1.22.3`,
    unparsable: "garbage no version",
    ownerRepo: "oras-project/oras",
  },
];

for (const spec of ghSpecs) {
  describe(`${spec.name} provider`, () => {
    it("isAvailable returns true when binary is found", async () => {
      commandExistsMock.mockResolvedValueOnce(true);
      await expect(new spec.Ctor().isAvailable()).resolves.toBe(true);
      expect(commandExistsMock).toHaveBeenCalledWith(spec.binary);
    });

    it("isAvailable returns false when binary is missing", async () => {
      commandExistsMock.mockResolvedValueOnce(false);
      await expect(new spec.Ctor().isAvailable()).resolves.toBe(false);
    });

    it("listOutdated returns [] when version probe fails", async () => {
      runMock.mockResolvedValueOnce(mkRun("", true));
      await expect(new spec.Ctor().listOutdated()).resolves.toEqual([]);
      expect(fetchGitHubReleaseLatestMock).not.toHaveBeenCalled();
    });

    it("listOutdated returns [] when version cannot be parsed", async () => {
      runMock.mockResolvedValueOnce(mkRun(spec.unparsable));
      await expect(new spec.Ctor().listOutdated()).resolves.toEqual([]);
      expect(fetchGitHubReleaseLatestMock).not.toHaveBeenCalled();
    });

    it("listOutdated returns [] when latest is null", async () => {
      runMock.mockResolvedValueOnce(mkRun(spec.versionStdout("1.0.0")));
      fetchGitHubReleaseLatestMock.mockResolvedValueOnce(null);
      await expect(new spec.Ctor().listOutdated()).resolves.toEqual([]);
      expect(fetchGitHubReleaseLatestMock).toHaveBeenCalledWith(spec.ownerRepo);
    });

    it("listOutdated returns [] when current === latest", async () => {
      runMock.mockResolvedValueOnce(mkRun(spec.versionStdout("1.2.3")));
      fetchGitHubReleaseLatestMock.mockResolvedValueOnce("1.2.3");
      await expect(new spec.Ctor().listOutdated()).resolves.toEqual([]);
    });

    it("listOutdated returns row with note when versions differ", async () => {
      runMock.mockResolvedValueOnce(mkRun(spec.versionStdout("1.0.0")));
      fetchGitHubReleaseLatestMock.mockResolvedValueOnce("1.2.3");
      detectInstallSourceMock.mockResolvedValueOnce("winget");
      describeSourceMock.mockReturnValueOnce("via winget");

      const rows = (await new spec.Ctor().listOutdated()) as Array<{
        id: string;
        current: string;
        latest: string;
        note: string;
        manual?: boolean;
      }>;
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        id: spec.name,
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

      const rows = (await new spec.Ctor().listOutdated()) as Array<{ manual?: boolean }>;
      expect(rows[0]).toMatchObject({ manual: true });
    });

    it("update delegates with the expected binary", async () => {
      delegateUpdateMock.mockResolvedValueOnce({ id: spec.name, success: true });
      const res = await new spec.Ctor().update(spec.name);
      expect(res).toEqual({ id: spec.name, success: true });
      expect(delegateUpdateMock).toHaveBeenCalledTimes(1);
      const call = delegateUpdateMock.mock.calls[0]![0] as {
        id: string;
        binary: string;
        packageIds: Record<string, string>;
        manualMessage: string;
      };
      expect(call.id).toBe(spec.name);
      expect(call.binary).toBe(spec.binary);
      expect(typeof call.manualMessage).toBe("string");
      expect(call.manualMessage.length).toBeGreaterThan(0);
    });

    it("updateAll returns [] when no packages", async () => {
      await expect(new spec.Ctor().updateAll([])).resolves.toEqual([]);
      expect(delegateUpdateMock).not.toHaveBeenCalled();
    });

    it("updateAll runs once when packages are present", async () => {
      delegateUpdateMock.mockResolvedValueOnce({ id: spec.name, success: true });
      const res = await new spec.Ctor().updateAll([
        { id: spec.name, name: spec.name, current: "1.0.0", latest: "2.0.0" } as never,
      ]);
      expect(res).toEqual([{ id: spec.name, success: true }]);
      expect(delegateUpdateMock).toHaveBeenCalledTimes(1);
    });
  });
}

// ---------------------------------------------------------------------------
// Desktop providers (Docker Desktop, Podman Desktop, Rancher Desktop)
// ---------------------------------------------------------------------------

const ORIGINAL_PLATFORM = process.platform;
const ORIGINAL_ENV = { ...process.env };

function setPlatform(p: NodeJS.Platform) {
  Object.defineProperty(process, "platform", { value: p, configurable: true });
}

afterEach(() => {
  Object.defineProperty(process, "platform", {
    value: ORIGINAL_PLATFORM,
    configurable: true,
  });
  process.env = { ...ORIGINAL_ENV };
});

describe("docker-desktop provider", () => {
  beforeEach(() => {
    setPlatform("win32");
    process.env["ProgramFiles"] = "C:\\Program Files";
    process.env["ProgramFiles(x86)"] = "C:\\Program Files (x86)";
  });

  it("isAvailable false when no exe found", async () => {
    existsSyncMock.mockReturnValue(false);
    await expect(new DockerDesktopProvider().isAvailable()).resolves.toBe(false);
  });

  it("isAvailable true when ProgramFiles exe exists", async () => {
    existsSyncMock.mockImplementation((p: string) =>
      p.includes("Program Files\\Docker"),
    );
    await expect(new DockerDesktopProvider().isAvailable()).resolves.toBe(true);
  });

  it("isAvailable picks the x86 path when only that exists", async () => {
    existsSyncMock.mockImplementation((p: string) => p.includes("(x86)"));
    await expect(new DockerDesktopProvider().isAvailable()).resolves.toBe(true);
  });

  it("isAvailable handles missing ProgramFiles env vars", async () => {
    delete process.env["ProgramFiles"];
    delete process.env["ProgramFiles(x86)"];
    existsSyncMock.mockReturnValue(false);
    await expect(new DockerDesktopProvider().isAvailable()).resolves.toBe(false);
  });

  it("listOutdated returns [] when exe is missing", async () => {
    existsSyncMock.mockReturnValue(false);
    await expect(new DockerDesktopProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] on non-win32 (no version readable)", async () => {
    setPlatform("linux");
    existsSyncMock.mockReturnValue(true);
    await expect(new DockerDesktopProvider().listOutdated()).resolves.toEqual([]);
    expect(runMock).not.toHaveBeenCalled();
  });

  it("listOutdated returns [] when powershell probe fails", async () => {
    existsSyncMock.mockReturnValue(true);
    runMock.mockResolvedValueOnce(mkRun("", true));
    await expect(new DockerDesktopProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when product version output is empty", async () => {
    existsSyncMock.mockReturnValue(true);
    runMock.mockResolvedValueOnce(mkRun("   "));
    await expect(new DockerDesktopProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when version doesn't match regex", async () => {
    existsSyncMock.mockReturnValue(true);
    runMock.mockResolvedValueOnce(mkRun("not-a-version-string"));
    await expect(new DockerDesktopProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when fetch !ok", async () => {
    existsSyncMock.mockReturnValue(true);
    runMock.mockResolvedValueOnce(mkRun("4.34.2.167585"));
    fetchMock.mockResolvedValueOnce(jsonResponse({}, false));
    await expect(new DockerDesktopProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when fetch throws", async () => {
    existsSyncMock.mockReturnValue(true);
    runMock.mockResolvedValueOnce(mkRun("4.34.2.167585"));
    fetchMock.mockRejectedValueOnce(new Error("network"));
    await expect(new DockerDesktopProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when tag_name is missing", async () => {
    existsSyncMock.mockReturnValue(true);
    runMock.mockResolvedValueOnce(mkRun("4.34.2.167585"));
    fetchMock.mockResolvedValueOnce(jsonResponse({}));
    await expect(new DockerDesktopProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when tag_name has no semver match", async () => {
    existsSyncMock.mockReturnValue(true);
    runMock.mockResolvedValueOnce(mkRun("4.34.2.167585"));
    fetchMock.mockResolvedValueOnce(jsonResponse({ tag_name: "no-numbers-here" }));
    await expect(new DockerDesktopProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when current === latest", async () => {
    existsSyncMock.mockReturnValue(true);
    runMock.mockResolvedValueOnce(mkRun("4.34.2.167585"));
    fetchMock.mockResolvedValueOnce(jsonResponse({ tag_name: "v4.34.2" }));
    await expect(new DockerDesktopProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns row when versions differ (using tag_name)", async () => {
    existsSyncMock.mockReturnValue(true);
    runMock.mockResolvedValueOnce(mkRun("4.34.2.167585"));
    fetchMock.mockResolvedValueOnce(jsonResponse({ tag_name: "v4.35.0" }));
    const rows = await new DockerDesktopProvider().listOutdated();
    expect(rows).toEqual([
      {
        id: "docker-desktop",
        name: "Docker Desktop",
        current: "4.34.2",
        latest: "4.35.0",
        note: "GUI updater",
        manual: true,
      },
    ]);
  });

  it("listOutdated falls back to `name` field when tag_name absent", async () => {
    existsSyncMock.mockReturnValue(true);
    runMock.mockResolvedValueOnce(mkRun("4.34.2"));
    fetchMock.mockResolvedValueOnce(jsonResponse({ name: "4.36.0" }));
    const rows = await new DockerDesktopProvider().listOutdated();
    expect(rows[0]).toMatchObject({ current: "4.34.2", latest: "4.36.0", manual: true });
  });

  it("update returns a skipped manual outcome", async () => {
    const res = await new DockerDesktopProvider().update("docker-desktop");
    expect(res).toMatchObject({
      id: "docker-desktop",
      success: false,
      skipped: true,
    });
    expect(res.message).toMatch(/Docker Desktop/);
  });

  it("updateAll returns [] when no packages", async () => {
    await expect(new DockerDesktopProvider().updateAll([])).resolves.toEqual([]);
  });

  it("updateAll returns one outcome when packages are present", async () => {
    const res = await new DockerDesktopProvider().updateAll([
      {
        id: "docker-desktop",
        name: "Docker Desktop",
        current: "4.34.2",
        latest: "4.35.0",
      } as never,
    ]);
    expect(res).toHaveLength(1);
    expect(res[0]).toMatchObject({ id: "docker-desktop", success: false, skipped: true });
  });
});

describe("podman-desktop provider", () => {
  beforeEach(() => {
    setPlatform("win32");
    process.env["LOCALAPPDATA"] = "C:\\Users\\u\\AppData\\Local";
    process.env["ProgramFiles"] = "C:\\Program Files";
  });

  it("isAvailable false when no exe exists", async () => {
    existsSyncMock.mockReturnValue(false);
    await expect(new PodmanDesktopProvider().isAvailable()).resolves.toBe(false);
  });

  it("isAvailable true when LOCALAPPDATA exe exists", async () => {
    existsSyncMock.mockImplementation((p: string) =>
      p.includes("\\Programs\\podman-desktop\\"),
    );
    await expect(new PodmanDesktopProvider().isAvailable()).resolves.toBe(true);
  });

  it("isAvailable true via ProgramFiles fallback", async () => {
    delete process.env["LOCALAPPDATA"];
    existsSyncMock.mockImplementation((p: string) =>
      p.includes("Program Files\\Podman Desktop"),
    );
    await expect(new PodmanDesktopProvider().isAvailable()).resolves.toBe(true);
  });

  it("isAvailable handles missing both env vars", async () => {
    delete process.env["LOCALAPPDATA"];
    delete process.env["ProgramFiles"];
    existsSyncMock.mockReturnValue(false);
    await expect(new PodmanDesktopProvider().isAvailable()).resolves.toBe(false);
  });

  it("listOutdated returns [] when exe missing", async () => {
    existsSyncMock.mockReturnValue(false);
    await expect(new PodmanDesktopProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] on non-win32 (cannot read version)", async () => {
    setPlatform("linux");
    existsSyncMock.mockReturnValue(true);
    await expect(new PodmanDesktopProvider().listOutdated()).resolves.toEqual([]);
    expect(runMock).not.toHaveBeenCalled();
  });

  it("listOutdated returns [] when version probe fails", async () => {
    existsSyncMock.mockReturnValue(true);
    runMock.mockResolvedValueOnce(mkRun("", true));
    await expect(new PodmanDesktopProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when product version is empty", async () => {
    existsSyncMock.mockReturnValue(true);
    runMock.mockResolvedValueOnce(mkRun(""));
    await expect(new PodmanDesktopProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when version doesn't match regex", async () => {
    existsSyncMock.mockReturnValue(true);
    runMock.mockResolvedValueOnce(mkRun("garbage-version-format"));
    await expect(new PodmanDesktopProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when fetch returns null", async () => {
    existsSyncMock.mockReturnValue(true);
    runMock.mockResolvedValueOnce(mkRun("1.12.0"));
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce(null);
    await expect(new PodmanDesktopProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when normalized current equals latest", async () => {
    existsSyncMock.mockReturnValue(true);
    runMock.mockResolvedValueOnce(mkRun("1.12.0"));
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("v1.12.0");
    await expect(new PodmanDesktopProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns a manual row when versions differ", async () => {
    existsSyncMock.mockReturnValue(true);
    runMock.mockResolvedValueOnce(mkRun("1.12.0"));
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("1.13.0");
    const rows = await new PodmanDesktopProvider().listOutdated();
    expect(rows).toEqual([
      {
        id: "podman-desktop",
        name: "Podman Desktop",
        current: "1.12.0",
        latest: "1.13.0",
        note: "GUI updater",
        manual: true,
      },
    ]);
    expect(fetchGitHubReleaseLatestMock).toHaveBeenCalledWith("containers/podman-desktop");
  });

  it("listOutdated parses pre-release tags (e.g. 1.13.0-rc1)", async () => {
    existsSyncMock.mockReturnValue(true);
    runMock.mockResolvedValueOnce(mkRun("1.12.0-beta1   extra info"));
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("1.13.0");
    const rows = await new PodmanDesktopProvider().listOutdated();
    expect(rows[0]).toMatchObject({ current: "1.12.0-beta1", latest: "1.13.0" });
  });

  it("update returns a manual skipped outcome", async () => {
    const res = await new PodmanDesktopProvider().update("podman-desktop");
    expect(res).toMatchObject({
      id: "podman-desktop",
      success: false,
      skipped: true,
    });
    expect(res.message).toMatch(/Podman Desktop/);
  });

  it("updateAll returns [] when no packages", async () => {
    await expect(new PodmanDesktopProvider().updateAll([])).resolves.toEqual([]);
  });

  it("updateAll returns one outcome with packages", async () => {
    const res = await new PodmanDesktopProvider().updateAll([
      {
        id: "podman-desktop",
        name: "Podman Desktop",
        current: "1.12.0",
        latest: "1.13.0",
      } as never,
    ]);
    expect(res).toHaveLength(1);
    expect(res[0]).toMatchObject({ skipped: true });
  });
});

describe("rancher-desktop provider", () => {
  beforeEach(() => {
    setPlatform("win32");
    process.env["LOCALAPPDATA"] = "C:\\Users\\u\\AppData\\Local";
    process.env["ProgramFiles"] = "C:\\Program Files";
  });

  it("isAvailable false when no exe exists", async () => {
    existsSyncMock.mockReturnValue(false);
    await expect(new RancherDesktopProvider().isAvailable()).resolves.toBe(false);
  });

  it("isAvailable true when LOCALAPPDATA exe exists", async () => {
    existsSyncMock.mockImplementation((p: string) =>
      p.includes("\\Programs\\Rancher Desktop\\"),
    );
    await expect(new RancherDesktopProvider().isAvailable()).resolves.toBe(true);
  });

  it("isAvailable true via ProgramFiles fallback", async () => {
    delete process.env["LOCALAPPDATA"];
    existsSyncMock.mockImplementation((p: string) =>
      p.includes("Program Files\\Rancher Desktop"),
    );
    await expect(new RancherDesktopProvider().isAvailable()).resolves.toBe(true);
  });

  it("isAvailable false when env vars missing entirely", async () => {
    delete process.env["LOCALAPPDATA"];
    delete process.env["ProgramFiles"];
    existsSyncMock.mockReturnValue(false);
    await expect(new RancherDesktopProvider().isAvailable()).resolves.toBe(false);
  });

  it("listOutdated returns [] when exe missing", async () => {
    existsSyncMock.mockReturnValue(false);
    await expect(new RancherDesktopProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] on non-win32", async () => {
    setPlatform("linux");
    existsSyncMock.mockReturnValue(true);
    await expect(new RancherDesktopProvider().listOutdated()).resolves.toEqual([]);
    expect(runMock).not.toHaveBeenCalled();
  });

  it("listOutdated returns [] when version probe fails", async () => {
    existsSyncMock.mockReturnValue(true);
    runMock.mockResolvedValueOnce(mkRun("", true));
    await expect(new RancherDesktopProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when product version is empty", async () => {
    existsSyncMock.mockReturnValue(true);
    runMock.mockResolvedValueOnce(mkRun(""));
    await expect(new RancherDesktopProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when version regex doesn't match", async () => {
    existsSyncMock.mockReturnValue(true);
    runMock.mockResolvedValueOnce(mkRun("not-a-version"));
    await expect(new RancherDesktopProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when fetch returns null", async () => {
    existsSyncMock.mockReturnValue(true);
    runMock.mockResolvedValueOnce(mkRun("1.13.0"));
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce(null);
    await expect(new RancherDesktopProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when normalized current equals latest", async () => {
    existsSyncMock.mockReturnValue(true);
    runMock.mockResolvedValueOnce(mkRun("1.13.0"));
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("v1.13.0");
    await expect(new RancherDesktopProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns manual row when versions differ", async () => {
    existsSyncMock.mockReturnValue(true);
    runMock.mockResolvedValueOnce(mkRun("1.13.0"));
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("1.14.0");
    const rows = await new RancherDesktopProvider().listOutdated();
    expect(rows).toEqual([
      {
        id: "rancher-desktop",
        name: "Rancher Desktop",
        current: "1.13.0",
        latest: "1.14.0",
        note: "GUI updater",
        manual: true,
      },
    ]);
    expect(fetchGitHubReleaseLatestMock).toHaveBeenCalledWith(
      "rancher-sandbox/rancher-desktop",
    );
  });

  it("update returns a manual skipped outcome", async () => {
    const res = await new RancherDesktopProvider().update("rancher-desktop");
    expect(res).toMatchObject({
      id: "rancher-desktop",
      success: false,
      skipped: true,
    });
    expect(res.message).toMatch(/Rancher Desktop/);
  });

  it("updateAll returns [] when no packages", async () => {
    await expect(new RancherDesktopProvider().updateAll([])).resolves.toEqual([]);
  });

  it("updateAll returns one outcome with packages", async () => {
    const res = await new RancherDesktopProvider().updateAll([
      {
        id: "rancher-desktop",
        name: "Rancher Desktop",
        current: "1.13.0",
        latest: "1.14.0",
      } as never,
    ]);
    expect(res).toHaveLength(1);
    expect(res[0]).toMatchObject({ skipped: true });
  });
});
