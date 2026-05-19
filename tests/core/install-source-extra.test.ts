import { afterEach, describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Mocks the runner so we can exercise:
 *   - detectInstallSource: classify based on the first PATH hit (or fall back to "manual").
 *   - runPmUpdate: per-source dispatch (scoop/choco/winget/manual) + missing-id manual fallback.
 *   - delegateUpdate: end-to-end (detect -> dispatch) wiring.
 *   - describeSource: every label branch.
 *
 * runInherit is asserted on argv to pin the exact CLI invocation per package manager,
 * since these strings are the contract delegateUpdate enforces with each PM.
 */

const { runMock, runInheritMock } = vi.hoisted(() => ({
  runMock: vi.fn(),
  runInheritMock: vi.fn(),
}));

vi.mock("../../src/core/runner.js", () => ({
  run: runMock,
  runInherit: runInheritMock,
}));

import {
  detectInstallSource,
  runPmUpdate,
  delegateUpdate,
  describeSource,
} from "../../src/core/install-source.js";

function mkRun(stdout: string, failed = false) {
  return {
    stdout,
    stderr: "",
    exitCode: failed ? 1 : 0,
    failed,
  };
}

beforeEach(() => {
  runMock.mockReset();
  runInheritMock.mockReset();
});

const originalPlatform = process.platform;
function setPlatform(value: NodeJS.Platform): void {
  Object.defineProperty(process, "platform", { value, configurable: true });
}

describe("detectInstallSource", () => {
  afterEach(() => {
    setPlatform(originalPlatform);
  });

  it("uses `where` on win32", async () => {
    setPlatform("win32");
    runMock.mockResolvedValueOnce(mkRun("", true));
    await detectInstallSource("foo");
    expect(runMock.mock.calls[0]![0]).toBe("where");
  });

  it("uses `which` on non-win32", async () => {
    setPlatform("linux");
    runMock.mockResolvedValueOnce(mkRun("", true));
    await detectInstallSource("foo");
    expect(runMock.mock.calls[0]![0]).toBe("which");
  });

  it("returns 'manual' when the probe (where/which) fails", async () => {
    runMock.mockResolvedValueOnce(mkRun("", true));
    await expect(detectInstallSource("nope")).resolves.toBe("manual");
    expect(runMock).toHaveBeenCalledTimes(1);
    const [probe, args] = runMock.mock.calls[0]!;
    expect(probe).toBe(process.platform === "win32" ? "where" : "which");
    expect(args).toEqual(["nope"]);
  });

  it("returns 'manual' on empty stdout (binary not located)", async () => {
    runMock.mockResolvedValueOnce(mkRun("   \n   "));
    await expect(detectInstallSource("ghost")).resolves.toBe("manual");
  });

  it("classifies the first PATH hit as scoop", async () => {
    runMock.mockResolvedValueOnce(
      mkRun(
        "C:\\Users\\me\\scoop\\shims\\terraform.exe\r\nC:\\Other\\terraform.exe",
      ),
    );
    await expect(detectInstallSource("terraform")).resolves.toBe("scoop");
  });

  it("classifies a chocolatey install correctly", async () => {
    runMock.mockResolvedValueOnce(
      mkRun("C:\\ProgramData\\chocolatey\\bin\\kubectl.exe"),
    );
    await expect(detectInstallSource("kubectl")).resolves.toBe("choco");
  });

  it("classifies a winget WindowsApps install correctly", async () => {
    runMock.mockResolvedValueOnce(
      mkRun("C:\\Program Files\\WindowsApps\\Foo_1.0__abc\\foo.exe"),
    );
    await expect(detectInstallSource("foo")).resolves.toBe("winget");
  });

  it("falls back to 'manual' for unknown PATH locations", async () => {
    runMock.mockResolvedValueOnce(mkRun("/usr/local/bin/foo"));
    await expect(detectInstallSource("foo")).resolves.toBe("manual");
  });
});

describe("runPmUpdate", () => {
  it("dispatches scoop with `update <id>` and shell:true", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await runPmUpdate(
      "terraform",
      "scoop",
      { scoop: "terraform" },
      "manual!",
    );
    expect(res).toEqual({ id: "terraform", success: true });
    expect(runInheritMock).toHaveBeenCalledWith(
      "scoop",
      ["update", "terraform"],
      { shell: true },
    );
  });

  it("dispatches choco with `upgrade <id> -y`", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await runPmUpdate(
      "terraform",
      "choco",
      { choco: "terraform" },
      "manual!",
    );
    expect(res).toEqual({ id: "terraform", success: true });
    expect(runInheritMock).toHaveBeenCalledWith(
      "choco",
      ["upgrade", "terraform", "-y"],
      {},
    );
  });

  it("dispatches winget with full silent + accept-agreements argv", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    await runPmUpdate(
      "terraform",
      "winget",
      { winget: "Hashicorp.Terraform" },
      "manual!",
    );
    expect(runInheritMock).toHaveBeenCalledWith(
      "winget",
      [
        "upgrade",
        "--id",
        "Hashicorp.Terraform",
        "--silent",
        "--accept-package-agreements",
        "--accept-source-agreements",
      ],
      {},
    );
  });

  it("propagates failure from the underlying PM call", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun("", true));
    const res = await runPmUpdate(
      "terraform",
      "choco",
      { choco: "terraform" },
      "manual!",
    );
    expect(res).toEqual({ id: "terraform", success: false });
  });

  it("returns a skipped manual outcome when source is 'manual'", async () => {
    const res = await runPmUpdate("x", "manual", { winget: "X.Y" }, "go DL it");
    expect(res).toEqual({
      id: "x",
      success: false,
      skipped: true,
      message: "go DL it",
    });
    expect(runInheritMock).not.toHaveBeenCalled();
  });

  it("falls back to manual when scoop id is missing", async () => {
    const res = await runPmUpdate(
      "tf",
      "scoop",
      { winget: "Hashicorp.Terraform" },
      "install via scoop bucket foo",
    );
    expect(res.success).toBe(false);
    expect(res.skipped).toBe(true);
    expect(res.message).toBe("install via scoop bucket foo");
    expect(runInheritMock).not.toHaveBeenCalled();
  });

  it("falls back to manual when choco id is missing", async () => {
    const res = await runPmUpdate("tf", "choco", {}, "manual choco");
    expect(res).toEqual({
      id: "tf",
      success: false,
      skipped: true,
      message: "manual choco",
    });
  });

  it("falls back to manual when winget id is missing", async () => {
    const res = await runPmUpdate("tf", "winget", {}, "manual winget");
    expect(res.skipped).toBe(true);
    expect(runInheritMock).not.toHaveBeenCalled();
  });
});

describe("delegateUpdate", () => {
  it("detects scoop and runs the scoop upgrade end-to-end", async () => {
    runMock.mockResolvedValueOnce(
      mkRun("C:\\Users\\me\\scoop\\shims\\terraform.exe"),
    );
    runInheritMock.mockResolvedValueOnce(mkRun(""));

    const res = await delegateUpdate({
      id: "terraform",
      binary: "terraform",
      packageIds: { scoop: "terraform", winget: "Hashicorp.Terraform" },
      manualMessage: "fallback",
    });

    expect(res).toEqual({ id: "terraform", success: true });
    expect(runInheritMock).toHaveBeenCalledWith(
      "scoop",
      ["update", "terraform"],
      { shell: true },
    );
  });

  it("returns the manual fallback when the binary is not on PATH", async () => {
    runMock.mockResolvedValueOnce(mkRun("", true));

    const res = await delegateUpdate({
      id: "terraform",
      binary: "terraform",
      packageIds: { scoop: "terraform", winget: "Hashicorp.Terraform" },
      manualMessage: "download from hashicorp.com",
    });

    expect(res).toEqual({
      id: "terraform",
      success: false,
      skipped: true,
      message: "download from hashicorp.com",
    });
    expect(runInheritMock).not.toHaveBeenCalled();
  });

  it("detects winget then dispatches winget upgrade", async () => {
    runMock.mockResolvedValueOnce(
      mkRun(
        "C:\\Users\\me\\AppData\\Local\\Microsoft\\WinGet\\Packages\\X\\foo.exe",
      ),
    );
    runInheritMock.mockResolvedValueOnce(mkRun(""));

    const res = await delegateUpdate({
      id: "foo",
      binary: "foo",
      packageIds: { winget: "Vendor.Foo" },
      manualMessage: "n/a",
    });

    expect(res.success).toBe(true);
    expect(runInheritMock.mock.calls[0]![0]).toBe("winget");
  });

  it("detects choco source but falls back to manual if no choco id is mapped", async () => {
    runMock.mockResolvedValueOnce(
      mkRun("C:\\ProgramData\\chocolatey\\bin\\foo.exe"),
    );

    const res = await delegateUpdate({
      id: "foo",
      binary: "foo",
      packageIds: { winget: "Vendor.Foo" }, // no choco id
      manualMessage: "no choco package available",
    });

    expect(res).toEqual({
      id: "foo",
      success: false,
      skipped: true,
      message: "no choco package available",
    });
    expect(runInheritMock).not.toHaveBeenCalled();
  });
});

describe("describeSource", () => {
  it("returns the expected French/English label for every source", () => {
    expect(describeSource("scoop")).toBe("via scoop");
    expect(describeSource("choco")).toBe("via choco");
    expect(describeSource("winget")).toBe("via winget");
    expect(describeSource("manual")).toBe("manuel");
  });
});
