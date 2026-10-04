import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getProviderMock } = vi.hoisted(() => ({ getProviderMock: vi.fn() }));
vi.mock("../../src/core/registry.js", () => ({
  getProvider: getProviderMock,
  scanAll: vi.fn(),
  ALL_PROVIDERS: [],
}));

// The elevated child must never read the user-writable settings file.
const { configStoreMock } = vi.hoisted(() => ({ configStoreMock: vi.fn() }));
vi.mock("../../src/core/config/store.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/core/config/store.js")>()),
  configStore: configStoreMock,
}));

import { adminBatchCommand } from "../../src/commands/admin-batch.js";
import { elevatedLogBuffer } from "../../src/core/log/elevated-bridge.js";
import { installLogBackend, log, type LogThreshold } from "../../src/core/log/log.js";
import { SinkLogBackend } from "../../src/core/log/log-backend.js";
import { PLATFORMS } from "../../src/core/platform/platforms.js";
import { getInstallTimeoutSeconds, setInstallTimeoutSeconds } from "../../src/core/runner.js";
import { restorePlatform, setPlatform } from "../support/platform.js";
import { useTempDirs } from "../support/temp-dirs.js";

const tempDir = useTempDirs();

const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

beforeEach(() => {
  getProviderMock.mockReset();
  stdoutSpy.mockClear();
  stderrSpy.mockClear();
});

afterEach(() => {
  // Best-effort cleanup is fine — we use unique filenames per test.
});

/**
 * Allocate a per-test input file inside a freshly-mkdtemp'd directory.
 * mkdtemp creates the directory with permissions tied to the current user
 * (mode 0700 on POSIX, ACL-restricted on Windows), so the test doesn't
 * write a predictable path into the shared tmp dir — silencing CodeQL's
 * "Insecure creation of file in the os temp dir".
 */
async function mkInputFile(): Promise<string> {
  const dir = await tempDir("gup-admin-batch-test-");
  return join(dir, "input.json");
}

describe("adminBatchCommand", () => {
  it("runs each target through provider.update and writes outcomes next to the input", async () => {
    const file = await mkInputFile();
    await writeFile(
      file,
      JSON.stringify({ version: 1, targets: ["choco:nodejs", "choco:python"] }),
      { encoding: "utf8", flag: "wx" },
    );
    const provider = {
      id: "choco",
      displayName: "Chocolatey",
      isAvailable: vi.fn(),
      listOutdated: vi.fn(),
      update: vi
        .fn()
        .mockResolvedValueOnce({ id: "nodejs", success: true })
        .mockResolvedValueOnce({ id: "python", success: false, message: "boom" }),
      updateAll: vi.fn(),
    };
    getProviderMock.mockReturnValue(provider);

    const code = await adminBatchCommand(file);
    expect(code).toBe(1); // python failed → exit 1
    expect(provider.update).toHaveBeenNthCalledWith(1, "nodejs");
    expect(provider.update).toHaveBeenNthCalledWith(2, "python");
    const out = JSON.parse(await readFile(`${file}.out`, "utf8"));
    expect(out).toEqual({
      version: 1,
      outcomes: [
        { id: "nodejs", success: true },
        { id: "python", success: false, message: "boom" },
      ],
    });
  });

  it("returns exit 0 when every outcome is success or skipped", async () => {
    const file = await mkInputFile();
    await writeFile(
      file,
      JSON.stringify({ version: 1, targets: ["choco:caddy"] }),
      { encoding: "utf8", flag: "wx" },
    );
    const provider = {
      id: "choco",
      displayName: "Chocolatey",
      isAvailable: vi.fn(),
      listOutdated: vi.fn(),
      update: vi.fn().mockResolvedValue({ id: "caddy", success: false, skipped: true }),
      updateAll: vi.fn(),
    };
    getProviderMock.mockReturnValue(provider);

    await expect(adminBatchCommand(file)).resolves.toBe(0);
  });

  it("emits a Format invalide outcome for a target missing the separator", async () => {
    const file = await mkInputFile();
    await writeFile(file, JSON.stringify({ version: 1, targets: ["malformed"] }), {
      encoding: "utf8",
      flag: "wx",
    });

    await adminBatchCommand(file);
    const out = JSON.parse(await readFile(`${file}.out`, "utf8"));
    expect(out.outcomes[0]).toMatchObject({
      id: "malformed",
      success: false,
      message: expect.stringContaining("Format invalide"),
    });
    expect(getProviderMock).not.toHaveBeenCalled();
  });

  it("emits a Provider inconnu outcome when getProvider returns undefined", async () => {
    const file = await mkInputFile();
    await writeFile(file, JSON.stringify({ version: 1, targets: ["ghost:x"] }), {
      encoding: "utf8",
      flag: "wx",
    });
    getProviderMock.mockReturnValueOnce(undefined);

    await adminBatchCommand(file);
    const out = JSON.parse(await readFile(`${file}.out`, "utf8"));
    expect(out.outcomes[0]).toMatchObject({
      id: "x",
      success: false,
      message: expect.stringContaining("Provider inconnu"),
    });
  });

  it("refuses a target whose provider does not run on this platform", async () => {
    const file = await mkInputFile();
    await writeFile(file, JSON.stringify({ version: 1, targets: ["brew-cask:firefox"] }), {
      encoding: "utf8",
      flag: "wx",
    });
    const provider = {
      id: "brew-cask",
      displayName: "Homebrew (casks)",
      platforms: PLATFORMS.macos,
      isAvailable: vi.fn(),
      listOutdated: vi.fn(),
      update: vi.fn(),
      updateAll: vi.fn(),
    };
    getProviderMock.mockReturnValue(provider);
    setPlatform("win32");

    try {
      await expect(adminBatchCommand(file)).resolves.toBe(1);
    } finally {
      restorePlatform();
    }
    const out = JSON.parse(await readFile(`${file}.out`, "utf8"));
    expect(out.outcomes[0]).toEqual({
      id: "firefox",
      success: false,
      message: "Provider brew-cask indisponible sur Windows (macOS uniquement)",
    });
    expect(provider.update).not.toHaveBeenCalled();
  });

  it("re-checks every target as the CLI does: no option, no control character, no empty id", async () => {
    const file = await mkInputFile();
    const targets = ["choco:--source=http://attacker.invalid", "choco:-y", "choco:git\u001b[2J", "choco:", "choco:git"];
    await writeFile(file, JSON.stringify({ version: 1, targets }), { encoding: "utf8", flag: "wx" });
    const provider = {
      id: "choco",
      displayName: "Chocolatey",
      isAvailable: vi.fn(),
      listOutdated: vi.fn(),
      update: vi.fn(async (id: string) => ({ id, success: true })),
      updateAll: vi.fn(),
    };
    getProviderMock.mockReturnValue(provider);

    await expect(adminBatchCommand(file)).resolves.toBe(1);

    expect(provider.update.mock.calls).toEqual([["git"]]);
    const out = JSON.parse(await readFile(`${file}.out`, "utf8")) as { outcomes: unknown[] };
    expect(out.outcomes).toEqual([
      { id: "--source=http://attacker.invalid", success: false, message: expect.stringContaining("« - »") },
      { id: "-y", success: false, message: expect.stringContaining("« - »") },
      { id: "git\u001b[2J", success: false, message: expect.stringContaining("caractère de contrôle") },
      { id: "", success: false, message: expect.stringContaining("identifiant de paquet manquant") },
      { id: "git", success: true },
    ]);
  });

  it("returns exit 2 and prints to stderr when the input file is unreadable or malformed", async () => {
    const code = await adminBatchCommand("/this/path/definitely/does/not/exist.json");
    expect(code).toBe(2);
    expect(stderrSpy).toHaveBeenCalled();
  });

  it("runs with the parent's timeout and log threshold, never its own settings", async () => {
    const file = await mkInputFile();
    await writeFile(
      file,
      JSON.stringify({
        version: 1,
        targets: ["choco:caddy"],
        installTimeoutSeconds: 45,
        logThreshold: "debug",
      }),
      { encoding: "utf8", flag: "wx" },
    );
    let timeoutDuringUpdate = -1;
    getProviderMock.mockReturnValue({
      id: "choco",
      displayName: "Chocolatey",
      isAvailable: vi.fn(),
      listOutdated: vi.fn(),
      update: vi.fn(async (id: string) => {
        timeoutDuringUpdate = getInstallTimeoutSeconds();
        return { id, success: true };
      }),
      updateAll: vi.fn(),
    });
    const thresholds: LogThreshold[] = [];
    installLogBackend({
      isEnabled: () => false,
      emit: () => {},
      setThreshold: (threshold) => thresholds.push(threshold),
    });
    try {
      await expect(adminBatchCommand(file)).resolves.toBe(0);
    } finally {
      installLogBackend(null);
      setInstallTimeoutSeconds(1200);
    }
    expect(timeoutDuringUpdate).toBe(45);
    expect(thresholds).toEqual(["debug"]);
    expect(configStoreMock).not.toHaveBeenCalled();
  });

  it("returns its log with the outcomes, each update's lines tagged with the package", async () => {
    const file = await mkInputFile();
    await writeFile(file, JSON.stringify({ version: 1, targets: ["choco:git"], logThreshold: "info" }), {
      encoding: "utf8",
      flag: "wx",
    });
    getProviderMock.mockReturnValue({
      id: "choco",
      displayName: "Chocolatey",
      isAvailable: vi.fn(),
      listOutdated: vi.fn(),
      update: vi.fn(async (id: string) => {
        log.info("cmd.end", { exitCode: 0 });
        return { id, success: true };
      }),
      updateAll: vi.fn(),
    });
    installLogBackend(new SinkLogBackend({ threshold: "off", sink: elevatedLogBuffer }));
    try {
      await expect(adminBatchCommand(file)).resolves.toBe(0);
    } finally {
      installLogBackend(null);
      elevatedLogBuffer.drain();
    }
    const out = JSON.parse(await readFile(`${file}.out`, "utf8")) as { log: string[] };
    expect(out.log.map((line) => JSON.parse(line) as unknown)).toEqual([
      expect.objectContaining({
        event: "cmd.end",
        ctx: { op: "update", providerId: "choco", packageId: "git" },
        data: { exitCode: 0 },
      }),
    ]);
  });
});
