import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Covers the POSIX half of install-source: Homebrew symlink resolution,
 * the Linux dpkg/rpm ownership probe, and the new runPmUpdate branches.
 *
 * Several tests exist purely as Windows regression guards — the whole point
 * of this work was to add macOS support *without* changing a single thing on
 * win32, so "realpath is never called on Windows" and "the scoop/choco/winget
 * classification is untouched" are assertions, not comments.
 */

const { runMock, runInheritMock } = vi.hoisted(() => ({
  runMock: vi.fn(),
  runInheritMock: vi.fn(),
}));

vi.mock("../../src/core/runner.js", () => ({
  run: runMock,
  runInherit: runInheritMock,
}));

const { realpathMock } = vi.hoisted(() => ({ realpathMock: vi.fn() }));

vi.mock("node:fs/promises", async () => {
  const actual =
    await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
  return { ...actual, realpath: realpathMock };
});

import {
  describeSource,
  detectInstallSource,
  inferSourceFromPath,
  resolveBinaryPath,
  runPmUpdate,
} from "../../src/core/install-source.js";

function mkRun(stdout: string, failed = false) {
  return { stdout, stderr: "", exitCode: failed ? 1 : 0, failed };
}

const ORIGINAL_PLATFORM = process.platform;

function setPlatform(value: NodeJS.Platform): void {
  Object.defineProperty(process, "platform", { value, configurable: true });
}

beforeEach(() => {
  runMock.mockReset();
  runInheritMock.mockReset();
  realpathMock.mockReset();
  // Default: realpath is the identity (no symlink), which is the shape of a
  // manually-installed binary.
  realpathMock.mockImplementation(async (p: string) => p);
});

afterEach(() => {
  setPlatform(ORIGINAL_PLATFORM);
});

describe("inferSourceFromPath — Homebrew", () => {
  it("classifies a Cellar path as brew on either prefix", () => {
    expect(
      inferSourceFromPath("/opt/homebrew/Cellar/kubernetes-cli/1.36.3/bin/kubectl"),
    ).toBe("brew");
    expect(
      inferSourceFromPath("/usr/local/Cellar/kubernetes-cli/1.36.3/bin/kubectl"),
    ).toBe("brew");
  });

  it("classifies a Caskroom path as brew", () => {
    expect(
      inferSourceFromPath("/opt/homebrew/Caskroom/docker/4.30.0/Docker.app/bin/docker"),
    ).toBe("brew");
  });

  it("classifies the Apple Silicon prefix as brew even outside Cellar", () => {
    expect(inferSourceFromPath("/opt/homebrew/bin/terraform")).toBe("brew");
  });

  it("classifies Linuxbrew as brew", () => {
    expect(inferSourceFromPath("/home/linuxbrew/.linuxbrew/bin/helm")).toBe("brew");
    expect(inferSourceFromPath("/home/me/.linuxbrew/bin/helm")).toBe("brew");
  });

  it("still returns manual for an unowned POSIX prefix", () => {
    expect(inferSourceFromPath("/usr/local/bin/kubectl")).toBe("manual");
    expect(inferSourceFromPath("/home/me/.local/bin/kubectl")).toBe("manual");
  });
});

describe("inferSourceFromPath — Windows regression guard", () => {
  it("keeps classifying scoop/choco/winget exactly as before", () => {
    expect(inferSourceFromPath("C:\\Users\\me\\scoop\\shims\\terraform.exe")).toBe(
      "scoop",
    );
    expect(inferSourceFromPath("C:\\ProgramData\\chocolatey\\bin\\kubectl.exe")).toBe(
      "choco",
    );
    expect(
      inferSourceFromPath("C:\\Program Files\\WindowsApps\\Foo_1.0__abc\\foo.exe"),
    ).toBe("winget");
    expect(
      inferSourceFromPath("C:\\Users\\me\\AppData\\Local\\Programs\\foo\\foo.exe"),
    ).toBe("winget");
  });

  it("never matches a brew pattern on a backslash path", () => {
    // The brew patterns are forward-slash only by construction, so no Windows
    // path can reach them — including one that literally contains "Cellar".
    expect(inferSourceFromPath("C:\\Tools\\Cellar\\foo.exe")).toBe("manual");
  });
});

describe("detectInstallSource — macOS", () => {
  it("follows the Homebrew shim symlink to its Cellar target", async () => {
    setPlatform("darwin");
    runMock.mockResolvedValueOnce(mkRun("/opt/homebrew/bin/kubectl"));
    realpathMock.mockResolvedValueOnce(
      "/opt/homebrew/Cellar/kubernetes-cli/1.36.3/bin/kubectl",
    );
    await expect(detectInstallSource("kubectl")).resolves.toBe("brew");
    expect(realpathMock).toHaveBeenCalledWith("/opt/homebrew/bin/kubectl");
  });

  it("degrades to the unresolved path when realpath throws", async () => {
    setPlatform("darwin");
    runMock.mockResolvedValueOnce(mkRun("/opt/homebrew/bin/terraform"));
    realpathMock.mockRejectedValueOnce(new Error("ELOOP"));
    // The raw path still matches the /opt/homebrew prefix, so detection holds.
    await expect(detectInstallSource("terraform")).resolves.toBe("brew");
  });

  it("returns manual for a hand-installed binary and runs no extra probe", async () => {
    setPlatform("darwin");
    runMock.mockResolvedValueOnce(mkRun("/usr/local/bin/kubectl"));
    await expect(detectInstallSource("kubectl")).resolves.toBe("manual");
    // macOS has no package database to interrogate: `which` only.
    expect(runMock).toHaveBeenCalledTimes(1);
  });
});

describe("detectInstallSource — Windows regression guard", () => {
  it("never calls realpath on win32", async () => {
    setPlatform("win32");
    runMock.mockResolvedValueOnce(mkRun("C:\\Users\\me\\scoop\\shims\\terraform.exe"));
    await expect(detectInstallSource("terraform")).resolves.toBe("scoop");
    expect(realpathMock).not.toHaveBeenCalled();
    expect(runMock).toHaveBeenCalledTimes(1);
    expect(runMock.mock.calls[0]![0]).toBe("where");
  });

  it("never probes the Linux package database on win32", async () => {
    setPlatform("win32");
    runMock.mockResolvedValueOnce(mkRun("C:\\Tools\\foo.exe"));
    await expect(detectInstallSource("foo")).resolves.toBe("manual");
    expect(runMock).toHaveBeenCalledTimes(1);
  });
});

describe("detectInstallSource — Linux package database", () => {
  it("classifies a dpkg-tracked binary as apt", async () => {
    setPlatform("linux");
    runMock.mockResolvedValueOnce(mkRun("/usr/bin/helm"));
    runMock.mockResolvedValueOnce(mkRun("helm: /usr/bin/helm"));
    await expect(detectInstallSource("helm")).resolves.toBe("apt");
    expect(runMock.mock.calls[1]).toEqual(["dpkg", ["-S", "/usr/bin/helm"]]);
  });

  it("falls through to rpm and classifies as dnf", async () => {
    setPlatform("linux");
    runMock.mockResolvedValueOnce(mkRun("/usr/bin/helm"));
    runMock.mockResolvedValueOnce(mkRun("", true));
    runMock.mockResolvedValueOnce(mkRun("helm-3.14.0-1.fc40.x86_64"));
    await expect(detectInstallSource("helm")).resolves.toBe("dnf");
    expect(runMock.mock.calls[2]).toEqual(["rpm", ["-qf", "/usr/bin/helm"]]);
  });

  it("returns manual when neither database owns the file", async () => {
    setPlatform("linux");
    runMock.mockResolvedValueOnce(mkRun("/usr/bin/helm"));
    runMock.mockResolvedValueOnce(mkRun("", true));
    runMock.mockResolvedValueOnce(mkRun("", true));
    await expect(detectInstallSource("helm")).resolves.toBe("manual");
  });

  it("treats an empty-stdout success as not owned", async () => {
    setPlatform("linux");
    runMock.mockResolvedValueOnce(mkRun("/usr/bin/helm"));
    runMock.mockResolvedValueOnce(mkRun("   \n  "));
    runMock.mockResolvedValueOnce(mkRun("", true));
    await expect(detectInstallSource("helm")).resolves.toBe("manual");
  });

  it("survives a probe that rejects (tool absent on this distro)", async () => {
    setPlatform("linux");
    runMock.mockResolvedValueOnce(mkRun("/usr/bin/helm"));
    runMock.mockRejectedValueOnce(new Error("ENOENT: dpkg"));
    runMock.mockRejectedValueOnce(new Error("ENOENT: rpm"));
    await expect(detectInstallSource("helm")).resolves.toBe("manual");
  });

  it("skips the probe entirely outside a system prefix", async () => {
    setPlatform("linux");
    runMock.mockResolvedValueOnce(mkRun("/home/me/.local/bin/helm"));
    await expect(detectInstallSource("helm")).resolves.toBe("manual");
    expect(runMock).toHaveBeenCalledTimes(1);
  });

  it("prefers the Homebrew match over the package database", async () => {
    setPlatform("linux");
    runMock.mockResolvedValueOnce(mkRun("/home/linuxbrew/.linuxbrew/bin/helm"));
    await expect(detectInstallSource("helm")).resolves.toBe("brew");
    expect(runMock).toHaveBeenCalledTimes(1);
  });
});

describe("resolveBinaryPath", () => {
  it("returns null when the binary is not on PATH", async () => {
    runMock.mockResolvedValueOnce(mkRun("", true));
    await expect(resolveBinaryPath("ghost")).resolves.toBeNull();
  });

  it("returns null on empty probe output", async () => {
    runMock.mockResolvedValueOnce(mkRun("  \n "));
    await expect(resolveBinaryPath("ghost")).resolves.toBeNull();
  });

  it("keeps only the first PATH hit", async () => {
    setPlatform("darwin");
    runMock.mockResolvedValueOnce(mkRun("/opt/homebrew/bin/foo\n/usr/bin/foo"));
    realpathMock.mockResolvedValueOnce("/opt/homebrew/Cellar/foo/1.0/bin/foo");
    await expect(resolveBinaryPath("foo")).resolves.toBe(
      "/opt/homebrew/Cellar/foo/1.0/bin/foo",
    );
  });
});

describe("runPmUpdate — POSIX package managers", () => {
  it("upgrades a Homebrew formula", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await runPmUpdate("helm", "brew", { brew: "helm" }, "manuel");
    expect(res).toEqual({ id: "helm", success: true });
    expect(runInheritMock).toHaveBeenCalledWith(
      "brew",
      ["upgrade", "--formula", "helm"],
      {},
    );
  });

  it("prefers the cask token over the formula when both are set", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    await runPmUpdate(
      "docker",
      "brew",
      { brew: "docker", brewCask: "docker-desktop" },
      "manuel",
    );
    expect(runInheritMock).toHaveBeenCalledWith(
      "brew",
      ["upgrade", "--cask", "docker-desktop"],
      {},
    );
  });

  it("reports failure when brew exits non-zero", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun("", true));
    const res = await runPmUpdate("helm", "brew", { brew: "helm" }, "manuel");
    expect(res).toEqual({ id: "helm", success: false });
  });

  it("upgrades a single apt package without touching the rest of the system", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    await runPmUpdate("helm", "apt", { apt: "helm" }, "manuel");
    expect(runInheritMock).toHaveBeenCalledWith(
      "sudo",
      ["apt-get", "install", "--only-upgrade", "-y", "helm"],
      {},
    );
  });

  it("upgrades a single dnf package", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    await runPmUpdate("helm", "dnf", { dnf: "helm" }, "manuel");
    expect(runInheritMock).toHaveBeenCalledWith(
      "sudo",
      ["dnf", "upgrade", "-y", "helm"],
      {},
    );
  });

  it("falls back to the manual message when the id for that source is missing", async () => {
    for (const source of ["brew", "apt", "dnf"] as const) {
      const res = await runPmUpdate("helm", source, {}, "installer a la main");
      expect(res).toEqual({
        id: "helm",
        success: false,
        skipped: true,
        message: "installer a la main",
      });
    }
    expect(runInheritMock).not.toHaveBeenCalled();
  });
});

describe("runPmUpdate — Windows regression guard", () => {
  it("still dispatches scoop/choco/winget with the exact same argv", async () => {
    runInheritMock.mockResolvedValue(mkRun(""));

    await runPmUpdate("t", "scoop", { scoop: "terraform" }, "m");
    expect(runInheritMock).toHaveBeenLastCalledWith(
      "scoop",
      ["update", "terraform"],
      { shell: true },
    );

    await runPmUpdate("t", "choco", { choco: "terraform" }, "m");
    expect(runInheritMock).toHaveBeenLastCalledWith(
      "choco",
      ["upgrade", "terraform", "-y"],
      {},
    );

    await runPmUpdate("t", "winget", { winget: "HashiCorp.Terraform" }, "m");
    expect(runInheritMock).toHaveBeenLastCalledWith(
      "winget",
      [
        "upgrade",
        "--id",
        "HashiCorp.Terraform",
        "--silent",
        "--accept-package-agreements",
        "--accept-source-agreements",
      ],
      {},
    );
  });

  it("ignores brew ids when the detected source is a Windows manager", async () => {
    // A provider declaring both must not have its Windows path hijacked.
    const res = await runPmUpdate("t", "winget", { brew: "terraform" }, "manuel");
    expect(res.skipped).toBe(true);
    expect(runInheritMock).not.toHaveBeenCalled();
  });
});

describe("describeSource", () => {
  it("labels every source", () => {
    expect(describeSource("scoop")).toBe("via scoop");
    expect(describeSource("choco")).toBe("via choco");
    expect(describeSource("winget")).toBe("via winget");
    expect(describeSource("brew")).toBe("via brew");
    expect(describeSource("apt")).toBe("via apt");
    expect(describeSource("dnf")).toBe("via dnf");
    expect(describeSource("manual")).toBe("manuel");
  });
});
