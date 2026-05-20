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
  isWslAvailableMock,
  listWslDistrosMock,
  distroHasBinaryMock,
  runInDistroMock,
  runInDistroInheritMock,
} = vi.hoisted(() => ({
  isWslAvailableMock: vi.fn(),
  listWslDistrosMock: vi.fn(),
  distroHasBinaryMock: vi.fn(),
  runInDistroMock: vi.fn(),
  runInDistroInheritMock: vi.fn(),
}));

vi.mock("../../src/core/wsl.js", () => ({
  isWslAvailable: isWslAvailableMock,
  listWslDistros: listWslDistrosMock,
  distroHasBinary: distroHasBinaryMock,
  runInDistro: runInDistroMock,
  runInDistroInherit: runInDistroInheritMock,
}));

import { WslProvider } from "../../src/providers/wsl/wsl.js";
import { WslAptProvider } from "../../src/providers/wsl/wsl-apt.js";
import { WslBrewProvider } from "../../src/providers/wsl/wsl-brew.js";
import { WslDnfProvider } from "../../src/providers/wsl/wsl-dnf.js";
import { WslFlatpakProvider } from "../../src/providers/wsl/wsl-flatpak.js";
import { WslNixProvider } from "../../src/providers/wsl/wsl-nix.js";
import { WslPacmanProvider } from "../../src/providers/wsl/wsl-pacman.js";

function mkRun(
  stdout: string,
  opts: { failed?: boolean; exitCode?: number; stderr?: string } = {},
) {
  const failed = opts.failed ?? false;
  return {
    stdout,
    stderr: opts.stderr ?? "",
    exitCode: opts.exitCode ?? (failed ? 1 : 0),
    failed,
  };
}

const originalPlatform = process.platform;

function setPlatform(value: NodeJS.Platform): void {
  Object.defineProperty(process, "platform", {
    value,
    configurable: true,
  });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  commandExistsMock.mockReset();
  runMock.mockReset();
  runInheritMock.mockReset();
  isWslAvailableMock.mockReset();
  listWslDistrosMock.mockReset();
  distroHasBinaryMock.mockReset();
  runInDistroMock.mockReset();
  runInDistroInheritMock.mockReset();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
  setPlatform(originalPlatform);
});

// ---------------------------------------------------------------------------
// WslProvider (kernel)
// ---------------------------------------------------------------------------
describe("WslProvider", () => {
  describe("isAvailable", () => {
    it("returns false on non-win32 without probing wsl", async () => {
      setPlatform("linux");
      await expect(new WslProvider().isAvailable()).resolves.toBe(false);
      expect(commandExistsMock).not.toHaveBeenCalled();
    });

    it("returns false on win32 when wsl is not on PATH", async () => {
      setPlatform("win32");
      commandExistsMock.mockResolvedValueOnce(false);
      await expect(new WslProvider().isAvailable()).resolves.toBe(false);
      expect(runMock).not.toHaveBeenCalled();
    });

    it("returns false on win32 when wsl --version fails", async () => {
      setPlatform("win32");
      commandExistsMock.mockResolvedValueOnce(true);
      runMock.mockResolvedValueOnce(mkRun("", { failed: true }));
      await expect(new WslProvider().isAvailable()).resolves.toBe(false);
    });

    it("returns true on win32 when wsl --version succeeds", async () => {
      setPlatform("win32");
      commandExistsMock.mockResolvedValueOnce(true);
      runMock.mockResolvedValueOnce(mkRun("WSL version: 2.0.0.0"));
      await expect(new WslProvider().isAvailable()).resolves.toBe(true);
    });
  });

  describe("listOutdated", () => {
    it("returns [] when wsl --version output cannot be parsed", async () => {
      runMock.mockResolvedValueOnce(mkRun("garbage with no version"));
      await expect(new WslProvider().listOutdated()).resolves.toEqual([]);
    });

    it("returns [] when GitHub API fetch is not ok", async () => {
      runMock.mockResolvedValueOnce(mkRun("WSL version: 2.0.0.0"));
      fetchMock.mockResolvedValueOnce({ ok: false });
      await expect(new WslProvider().listOutdated()).resolves.toEqual([]);
    });

    it("returns [] when GitHub API throws (timeout/abort)", async () => {
      runMock.mockResolvedValueOnce(mkRun("WSL version: 2.0.0.0"));
      fetchMock.mockRejectedValueOnce(new Error("network"));
      await expect(new WslProvider().listOutdated()).resolves.toEqual([]);
    });

    it("returns [] when GitHub API yields no tag_name", async () => {
      runMock.mockResolvedValueOnce(mkRun("WSL version: 2.0.0.0"));
      fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
      await expect(new WslProvider().listOutdated()).resolves.toEqual([]);
    });

    it("returns [] when latest version matches current", async () => {
      runMock.mockResolvedValueOnce(mkRun("WSL version: 2.0.0.0"));
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ tag_name: "2.0.0.0" }),
      });
      await expect(new WslProvider().listOutdated()).resolves.toEqual([]);
    });

    it("returns one entry when current differs from latest (with v-prefix stripped)", async () => {
      runMock.mockResolvedValueOnce(mkRun("WSL version: 2.1.0\nKernel..."));
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ tag_name: "v2.5.0" }),
      });
      const out = await new WslProvider().listOutdated();
      expect(out).toEqual([
        { id: "wsl", name: "WSL", current: "2.1.0", latest: "2.5.0" },
      ]);
    });
  });

  describe("update", () => {
    it("reports success when wsl --update succeeds", async () => {
      runInheritMock.mockResolvedValueOnce(mkRun(""));
      await expect(new WslProvider().update("wsl")).resolves.toEqual({
        id: "wsl",
        success: true,
      });
      expect(runInheritMock).toHaveBeenCalledWith("wsl", ["--update"]);
    });

    it("reports failure when wsl --update fails", async () => {
      runInheritMock.mockResolvedValueOnce(mkRun("", { failed: true }));
      await expect(new WslProvider().update("wsl")).resolves.toEqual({
        id: "wsl",
        success: false,
      });
    });
  });

  describe("updateAll", () => {
    it("returns [] when no packages", async () => {
      await expect(new WslProvider().updateAll([])).resolves.toEqual([]);
      expect(runInheritMock).not.toHaveBeenCalled();
    });

    it("delegates to update() when packages provided", async () => {
      runInheritMock.mockResolvedValueOnce(mkRun(""));
      await expect(
        new WslProvider().updateAll([
          { id: "wsl", current: "2.0", latest: "2.1" },
        ]),
      ).resolves.toEqual([{ id: "wsl", success: true }]);
    });
  });
});

// ---------------------------------------------------------------------------
// Shared availability behaviour for distro-backed providers
// ---------------------------------------------------------------------------
describe.each([
  ["wsl-apt", () => new WslAptProvider()],
  ["wsl-brew", () => new WslBrewProvider()],
  ["wsl-dnf", () => new WslDnfProvider()],
  ["wsl-flatpak", () => new WslFlatpakProvider()],
  ["wsl-nix", () => new WslNixProvider()],
  ["wsl-pacman", () => new WslPacmanProvider()],
] as const)("%s isAvailable()", (_id, make) => {
  it("returns false when WSL is unavailable", async () => {
    isWslAvailableMock.mockResolvedValueOnce(false);
    await expect(make().isAvailable()).resolves.toBe(false);
    expect(listWslDistrosMock).not.toHaveBeenCalled();
  });

  it("returns false when no distros are present", async () => {
    isWslAvailableMock.mockResolvedValueOnce(true);
    listWslDistrosMock.mockResolvedValueOnce([]);
    await expect(make().isAvailable()).resolves.toBe(false);
  });

  it("returns true when at least one distro is present", async () => {
    isWslAvailableMock.mockResolvedValueOnce(true);
    listWslDistrosMock.mockResolvedValueOnce(["Ubuntu"]);
    await expect(make().isAvailable()).resolves.toBe(true);
  });
});

// ---------------------------------------------------------------------------
// WslAptProvider
// ---------------------------------------------------------------------------
describe("WslAptProvider", () => {
  describe("listOutdated", () => {
    it("skips distros lacking apt-get", async () => {
      listWslDistrosMock.mockResolvedValueOnce(["Ubuntu", "Alpine"]);
      distroHasBinaryMock.mockResolvedValueOnce(true); // Ubuntu has apt-get
      runInDistroMock.mockResolvedValueOnce(mkRun("3\n"));
      distroHasBinaryMock.mockResolvedValueOnce(false); // Alpine no apt-get
      const out = await new WslAptProvider().listOutdated();
      expect(out).toEqual([
        { id: "Ubuntu", name: "Ubuntu (apt)", current: "?", latest: "3 pkg" },
      ]);
    });

    it("treats failing countUpgradable as zero (skipped)", async () => {
      listWslDistrosMock.mockResolvedValueOnce(["Ubuntu"]);
      distroHasBinaryMock.mockResolvedValueOnce(true);
      runInDistroMock.mockResolvedValueOnce(mkRun("", { failed: true }));
      await expect(new WslAptProvider().listOutdated()).resolves.toEqual([]);
    });

    it("treats non-numeric stdout as zero (skipped)", async () => {
      listWslDistrosMock.mockResolvedValueOnce(["Ubuntu"]);
      distroHasBinaryMock.mockResolvedValueOnce(true);
      runInDistroMock.mockResolvedValueOnce(mkRun("oops"));
      await expect(new WslAptProvider().listOutdated()).resolves.toEqual([]);
    });

    it("skips distros that report zero upgradable packages", async () => {
      listWslDistrosMock.mockResolvedValueOnce(["Ubuntu"]);
      distroHasBinaryMock.mockResolvedValueOnce(true);
      runInDistroMock.mockResolvedValueOnce(mkRun("0\n"));
      await expect(new WslAptProvider().listOutdated()).resolves.toEqual([]);
    });
  });

  describe("update", () => {
    it("returns success=true when runInDistroInherit succeeds", async () => {
      runInDistroInheritMock.mockResolvedValueOnce(mkRun(""));
      await expect(new WslAptProvider().update("Ubuntu")).resolves.toEqual({
        id: "Ubuntu",
        success: true,
      });
      const [distro, cmd, opts] = runInDistroInheritMock.mock.calls[0]!;
      expect(distro).toBe("Ubuntu");
      expect(cmd).toContain("apt-get");
      expect(opts).toEqual({ asRoot: true });
    });

    it("returns success=false when runInDistroInherit fails", async () => {
      runInDistroInheritMock.mockResolvedValueOnce(mkRun("", { failed: true }));
      await expect(new WslAptProvider().update("Ubuntu")).resolves.toEqual({
        id: "Ubuntu",
        success: false,
      });
    });
  });

  describe("updateAll", () => {
    it("returns [] when no packages", async () => {
      await expect(new WslAptProvider().updateAll([])).resolves.toEqual([]);
      expect(runInDistroInheritMock).not.toHaveBeenCalled();
    });

    it("delegates sequentially", async () => {
      runInDistroInheritMock
        .mockResolvedValueOnce(mkRun(""))
        .mockResolvedValueOnce(mkRun("", { failed: true }));
      const out = await new WslAptProvider().updateAll([
        { id: "Ubuntu", current: "?", latest: "1 pkg" },
        { id: "Debian", current: "?", latest: "2 pkg" },
      ]);
      expect(out).toEqual([
        { id: "Ubuntu", success: true },
        { id: "Debian", success: false },
      ]);
    });
  });
});

// ---------------------------------------------------------------------------
// WslBrewProvider
// ---------------------------------------------------------------------------
describe("WslBrewProvider", () => {
  describe("listOutdated", () => {
    it("skips distros without brew", async () => {
      listWslDistrosMock.mockResolvedValueOnce(["Ubuntu", "Debian"]);
      distroHasBinaryMock.mockResolvedValueOnce(false); // Ubuntu no brew
      distroHasBinaryMock.mockResolvedValueOnce(true); // Debian has brew
      runInDistroMock.mockResolvedValueOnce(mkRun("4\n"));
      const out = await new WslBrewProvider().listOutdated();
      expect(out).toEqual([
        { id: "Debian", name: "Debian (brew)", current: "?", latest: "4 pkg" },
      ]);
    });

    it("skips when countOutdated runner failed", async () => {
      listWslDistrosMock.mockResolvedValueOnce(["Ubuntu"]);
      distroHasBinaryMock.mockResolvedValueOnce(true);
      runInDistroMock.mockResolvedValueOnce(mkRun("", { failed: true }));
      await expect(new WslBrewProvider().listOutdated()).resolves.toEqual([]);
    });

    it("skips when stdout is not a finite number", async () => {
      listWslDistrosMock.mockResolvedValueOnce(["Ubuntu"]);
      distroHasBinaryMock.mockResolvedValueOnce(true);
      runInDistroMock.mockResolvedValueOnce(mkRun("NaN\n"));
      await expect(new WslBrewProvider().listOutdated()).resolves.toEqual([]);
    });

    it("skips when count is zero", async () => {
      listWslDistrosMock.mockResolvedValueOnce(["Ubuntu"]);
      distroHasBinaryMock.mockResolvedValueOnce(true);
      runInDistroMock.mockResolvedValueOnce(mkRun("0"));
      await expect(new WslBrewProvider().listOutdated()).resolves.toEqual([]);
    });
  });

  describe("update", () => {
    it("returns success=true on runner success (no asRoot)", async () => {
      runInDistroInheritMock.mockResolvedValueOnce(mkRun(""));
      await expect(new WslBrewProvider().update("Ubuntu")).resolves.toEqual({
        id: "Ubuntu",
        success: true,
      });
      const [, cmd, opts] = runInDistroInheritMock.mock.calls[0]!;
      expect(cmd).toContain("brew update");
      expect(cmd).toContain("brew upgrade");
      expect(opts).toBeUndefined();
    });

    it("returns success=false on runner failure", async () => {
      runInDistroInheritMock.mockResolvedValueOnce(mkRun("", { failed: true }));
      await expect(new WslBrewProvider().update("Ubuntu")).resolves.toEqual({
        id: "Ubuntu",
        success: false,
      });
    });
  });

  describe("updateAll", () => {
    it("returns [] when packages empty", async () => {
      await expect(new WslBrewProvider().updateAll([])).resolves.toEqual([]);
    });

    it("delegates per package", async () => {
      runInDistroInheritMock.mockResolvedValueOnce(mkRun(""));
      await expect(
        new WslBrewProvider().updateAll([
          { id: "Ubuntu", current: "?", latest: "4 pkg" },
        ]),
      ).resolves.toEqual([{ id: "Ubuntu", success: true }]);
    });
  });
});

// ---------------------------------------------------------------------------
// WslDnfProvider
// ---------------------------------------------------------------------------
describe("WslDnfProvider", () => {
  describe("listOutdated", () => {
    it("skips distros without dnf", async () => {
      listWslDistrosMock.mockResolvedValueOnce(["Ubuntu"]);
      distroHasBinaryMock.mockResolvedValueOnce(false);
      await expect(new WslDnfProvider().listOutdated()).resolves.toEqual([]);
    });

    it("returns no entry when exit code is 0 (no updates)", async () => {
      listWslDistrosMock.mockResolvedValueOnce(["Fedora"]);
      distroHasBinaryMock.mockResolvedValueOnce(true);
      runInDistroMock.mockResolvedValueOnce(mkRun("", { exitCode: 0 }));
      await expect(new WslDnfProvider().listOutdated()).resolves.toEqual([]);
    });

    it("returns no entry on unexpected exit codes", async () => {
      listWslDistrosMock.mockResolvedValueOnce(["Fedora"]);
      distroHasBinaryMock.mockResolvedValueOnce(true);
      runInDistroMock.mockResolvedValueOnce(
        mkRun("err", { exitCode: 1, failed: true }),
      );
      await expect(new WslDnfProvider().listOutdated()).resolves.toEqual([]);
    });

    it("returns count when exit code is 100 and stdout has package lines", async () => {
      listWslDistrosMock.mockResolvedValueOnce(["Fedora"]);
      distroHasBinaryMock.mockResolvedValueOnce(true);
      runInDistroMock.mockResolvedValueOnce(
        mkRun(
          "Last metadata expiration check: 0:01:23 ago\n" +
            "bash.x86_64 5.2.21-1.fc40 updates\n" +
            "kernel.x86_64 6.9.0-1.fc40 updates\n",
          { exitCode: 100, failed: true },
        ),
      );
      const out = await new WslDnfProvider().listOutdated();
      expect(out).toEqual([
        { id: "Fedora", name: "Fedora (dnf)", current: "?", latest: "2 pkg" },
      ]);
    });

    it("emits a refresh entry when exit code is 100 but stdout has no parseable lines", async () => {
      listWslDistrosMock.mockResolvedValueOnce(["Fedora"]);
      distroHasBinaryMock.mockResolvedValueOnce(true);
      runInDistroMock.mockResolvedValueOnce(
        mkRun("Last metadata expiration check: now\n", {
          exitCode: 100,
          failed: true,
        }),
      );
      await expect(new WslDnfProvider().listOutdated()).resolves.toEqual([
        { id: "Fedora", name: "Fedora (dnf)", current: "?", latest: "refresh" },
      ]);
    });
  });

  describe("update", () => {
    it("succeeds when runner succeeds", async () => {
      runInDistroInheritMock.mockResolvedValueOnce(mkRun(""));
      await expect(new WslDnfProvider().update("Fedora")).resolves.toEqual({
        id: "Fedora",
        success: true,
      });
      expect(runInDistroInheritMock).toHaveBeenCalledWith(
        "Fedora",
        "dnf -y upgrade",
        { asRoot: true },
      );
    });

    it("fails when runner fails", async () => {
      runInDistroInheritMock.mockResolvedValueOnce(mkRun("", { failed: true }));
      await expect(new WslDnfProvider().update("Fedora")).resolves.toEqual({
        id: "Fedora",
        success: false,
      });
    });
  });

  describe("updateAll", () => {
    it("returns [] when empty", async () => {
      await expect(new WslDnfProvider().updateAll([])).resolves.toEqual([]);
    });

    it("delegates per package", async () => {
      runInDistroInheritMock.mockResolvedValueOnce(mkRun(""));
      await expect(
        new WslDnfProvider().updateAll([
          { id: "Fedora", current: "?", latest: "2 pkg" },
        ]),
      ).resolves.toEqual([{ id: "Fedora", success: true }]);
    });
  });
});

// ---------------------------------------------------------------------------
// WslFlatpakProvider
// ---------------------------------------------------------------------------
describe("WslFlatpakProvider", () => {
  describe("listOutdated", () => {
    it("skips distros without flatpak", async () => {
      listWslDistrosMock.mockResolvedValueOnce(["Ubuntu"]);
      distroHasBinaryMock.mockResolvedValueOnce(false);
      await expect(new WslFlatpakProvider().listOutdated()).resolves.toEqual([]);
    });

    it("skips when countUpdates runner failed", async () => {
      listWslDistrosMock.mockResolvedValueOnce(["Ubuntu"]);
      distroHasBinaryMock.mockResolvedValueOnce(true);
      runInDistroMock.mockResolvedValueOnce(mkRun("", { failed: true }));
      await expect(new WslFlatpakProvider().listOutdated()).resolves.toEqual([]);
    });

    it("skips when stdout is non-numeric (NaN)", async () => {
      listWslDistrosMock.mockResolvedValueOnce(["Ubuntu"]);
      distroHasBinaryMock.mockResolvedValueOnce(true);
      runInDistroMock.mockResolvedValueOnce(mkRun("oops"));
      await expect(new WslFlatpakProvider().listOutdated()).resolves.toEqual([]);
    });

    it("skips when count is zero", async () => {
      listWslDistrosMock.mockResolvedValueOnce(["Ubuntu"]);
      distroHasBinaryMock.mockResolvedValueOnce(true);
      runInDistroMock.mockResolvedValueOnce(mkRun("0"));
      await expect(new WslFlatpakProvider().listOutdated()).resolves.toEqual([]);
    });

    it("returns entry when count is positive", async () => {
      listWslDistrosMock.mockResolvedValueOnce(["Ubuntu"]);
      distroHasBinaryMock.mockResolvedValueOnce(true);
      runInDistroMock.mockResolvedValueOnce(mkRun("5\n"));
      await expect(new WslFlatpakProvider().listOutdated()).resolves.toEqual([
        {
          id: "Ubuntu",
          name: "Ubuntu (flatpak)",
          current: "?",
          latest: "5 pkg",
        },
      ]);
    });
  });

  describe("update", () => {
    it("succeeds when runner succeeds", async () => {
      runInDistroInheritMock.mockResolvedValueOnce(mkRun(""));
      await expect(new WslFlatpakProvider().update("Ubuntu")).resolves.toEqual({
        id: "Ubuntu",
        success: true,
      });
      expect(runInDistroInheritMock).toHaveBeenCalledWith(
        "Ubuntu",
        "flatpak update --noninteractive --assumeyes",
      );
    });

    it("fails when runner fails", async () => {
      runInDistroInheritMock.mockResolvedValueOnce(mkRun("", { failed: true }));
      await expect(new WslFlatpakProvider().update("Ubuntu")).resolves.toEqual({
        id: "Ubuntu",
        success: false,
      });
    });
  });

  describe("updateAll", () => {
    it("returns [] when empty", async () => {
      await expect(new WslFlatpakProvider().updateAll([])).resolves.toEqual([]);
    });

    it("delegates per package", async () => {
      runInDistroInheritMock.mockResolvedValueOnce(mkRun(""));
      await expect(
        new WslFlatpakProvider().updateAll([
          { id: "Ubuntu", current: "?", latest: "1 pkg" },
        ]),
      ).resolves.toEqual([{ id: "Ubuntu", success: true }]);
    });
  });
});

// ---------------------------------------------------------------------------
// WslNixProvider
// ---------------------------------------------------------------------------
describe("WslNixProvider", () => {
  describe("listOutdated", () => {
    it("skips distros without nix-env", async () => {
      listWslDistrosMock.mockResolvedValueOnce(["Ubuntu"]);
      distroHasBinaryMock.mockResolvedValueOnce(false);
      await expect(new WslNixProvider().listOutdated()).resolves.toEqual([]);
    });

    it("emits a refresh entry per nix-enabled distro", async () => {
      listWslDistrosMock.mockResolvedValueOnce(["Ubuntu", "Debian"]);
      distroHasBinaryMock.mockResolvedValueOnce(true);
      distroHasBinaryMock.mockResolvedValueOnce(false);
      const out = await new WslNixProvider().listOutdated();
      expect(out).toEqual([
        {
          id: "Ubuntu",
          name: "Ubuntu (nix)",
          current: "?",
          latest: "refresh",
          note: "nix-channel --update && nix-env -u",
        },
      ]);
    });
  });

  describe("update", () => {
    it("succeeds when runner succeeds", async () => {
      runInDistroInheritMock.mockResolvedValueOnce(mkRun(""));
      await expect(new WslNixProvider().update("Ubuntu")).resolves.toEqual({
        id: "Ubuntu",
        success: true,
      });
      const [, cmd] = runInDistroInheritMock.mock.calls[0]!;
      expect(cmd).toContain("nix-channel --update");
      expect(cmd).toContain("nix-env -u");
    });

    it("fails when runner fails", async () => {
      runInDistroInheritMock.mockResolvedValueOnce(mkRun("", { failed: true }));
      await expect(new WslNixProvider().update("Ubuntu")).resolves.toEqual({
        id: "Ubuntu",
        success: false,
      });
    });
  });

  describe("updateAll", () => {
    it("returns [] when empty", async () => {
      await expect(new WslNixProvider().updateAll([])).resolves.toEqual([]);
    });

    it("delegates per package", async () => {
      runInDistroInheritMock.mockResolvedValueOnce(mkRun(""));
      await expect(
        new WslNixProvider().updateAll([
          {
            id: "Ubuntu",
            current: "?",
            latest: "refresh",
          },
        ]),
      ).resolves.toEqual([{ id: "Ubuntu", success: true }]);
    });
  });
});

// ---------------------------------------------------------------------------
// WslPacmanProvider
// ---------------------------------------------------------------------------
describe("WslPacmanProvider", () => {
  describe("listOutdated", () => {
    it("skips distros without pacman", async () => {
      listWslDistrosMock.mockResolvedValueOnce(["Ubuntu"]);
      distroHasBinaryMock.mockResolvedValueOnce(false); // no pacman
      await expect(new WslPacmanProvider().listOutdated()).resolves.toEqual([]);
    });

    it("emits 'N pkg' entry when checkupdates returns lines (exit 0)", async () => {
      listWslDistrosMock.mockResolvedValueOnce(["Arch"]);
      distroHasBinaryMock.mockResolvedValueOnce(true); // has pacman
      distroHasBinaryMock.mockResolvedValueOnce(true); // has checkupdates
      runInDistroMock.mockResolvedValueOnce(
        mkRun("bash 5.2-1 -> 5.3-1\nzsh 5.9-1 -> 5.9-2\n", { exitCode: 0 }),
      );
      const out = await new WslPacmanProvider().listOutdated();
      expect(out).toEqual([
        { id: "Arch", name: "Arch (pacman)", current: "?", latest: "2 pkg" },
      ]);
    });

    it("skips when checkupdates returns empty stdout (exit 0)", async () => {
      listWslDistrosMock.mockResolvedValueOnce(["Arch"]);
      distroHasBinaryMock.mockResolvedValueOnce(true);
      distroHasBinaryMock.mockResolvedValueOnce(true);
      runInDistroMock.mockResolvedValueOnce(mkRun("", { exitCode: 0 }));
      await expect(new WslPacmanProvider().listOutdated()).resolves.toEqual([]);
    });

    it("skips when checkupdates exits 2 (no updates / lock contention)", async () => {
      listWslDistrosMock.mockResolvedValueOnce(["Arch"]);
      distroHasBinaryMock.mockResolvedValueOnce(true);
      distroHasBinaryMock.mockResolvedValueOnce(true);
      runInDistroMock.mockResolvedValueOnce(
        mkRun("", { exitCode: 2, failed: true }),
      );
      await expect(new WslPacmanProvider().listOutdated()).resolves.toEqual([]);
    });

    it("skips when checkupdates exits with an unexpected code", async () => {
      listWslDistrosMock.mockResolvedValueOnce(["Arch"]);
      distroHasBinaryMock.mockResolvedValueOnce(true);
      distroHasBinaryMock.mockResolvedValueOnce(true);
      runInDistroMock.mockResolvedValueOnce(
        mkRun("", { exitCode: 1, failed: true }),
      );
      await expect(new WslPacmanProvider().listOutdated()).resolves.toEqual([]);
    });

    it("falls back to refresh entry with French note when checkupdates is absent", async () => {
      listWslDistrosMock.mockResolvedValueOnce(["Arch"]);
      distroHasBinaryMock.mockResolvedValueOnce(true); // has pacman
      distroHasBinaryMock.mockResolvedValueOnce(false); // no checkupdates
      const out = await new WslPacmanProvider().listOutdated();
      expect(out).toHaveLength(1);
      expect(out[0]).toMatchObject({
        id: "Arch",
        name: "Arch (pacman)",
        current: "?",
        latest: "refresh",
      });
      expect(out[0]!.note).toMatch(/pacman-contrib/);
      expect(out[0]!.note).toMatch(/clencher pacman -Syu/);
    });
  });

  describe("update", () => {
    it("succeeds when runner succeeds", async () => {
      runInDistroInheritMock.mockResolvedValueOnce(mkRun(""));
      await expect(new WslPacmanProvider().update("Arch")).resolves.toEqual({
        id: "Arch",
        success: true,
      });
      expect(runInDistroInheritMock).toHaveBeenCalledWith(
        "Arch",
        "pacman -Syu --noconfirm",
        { asRoot: true },
      );
    });

    it("fails when runner fails", async () => {
      runInDistroInheritMock.mockResolvedValueOnce(mkRun("", { failed: true }));
      await expect(new WslPacmanProvider().update("Arch")).resolves.toEqual({
        id: "Arch",
        success: false,
      });
    });
  });

  describe("updateAll", () => {
    it("returns [] when empty", async () => {
      await expect(new WslPacmanProvider().updateAll([])).resolves.toEqual([]);
    });

    it("delegates per package", async () => {
      runInDistroInheritMock.mockResolvedValueOnce(mkRun(""));
      await expect(
        new WslPacmanProvider().updateAll([
          { id: "Arch", current: "?", latest: "2 pkg" },
        ]),
      ).resolves.toEqual([{ id: "Arch", success: true }]);
    });
  });
});
