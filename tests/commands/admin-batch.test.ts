import { readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getProviderMock } = vi.hoisted(() => ({ getProviderMock: vi.fn() }));
vi.mock("../../src/core/registry.js", () => ({
  getProvider: getProviderMock,
  scanAll: vi.fn(),
  ALL_PROVIDERS: [],
}));

import { adminBatchCommand } from "../../src/commands/admin-batch.js";

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

function mkInputFile(targets: string[]): string {
  return join(tmpdir(), `gup-admin-batch-test-${randomBytes(6).toString("hex")}.json`);
}

describe("adminBatchCommand", () => {
  it("runs each target through provider.update and writes outcomes next to the input", async () => {
    const file = mkInputFile([]);
    await writeFile(
      file,
      JSON.stringify({ version: 1, targets: ["choco:nodejs", "choco:python"] }),
      { encoding: "utf8" },
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
    const file = mkInputFile([]);
    await writeFile(
      file,
      JSON.stringify({ version: 1, targets: ["choco:caddy"] }),
      { encoding: "utf8" },
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
    const file = mkInputFile([]);
    await writeFile(file, JSON.stringify({ version: 1, targets: ["malformed"] }), {
      encoding: "utf8",
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
    const file = mkInputFile([]);
    await writeFile(file, JSON.stringify({ version: 1, targets: ["ghost:x"] }), {
      encoding: "utf8",
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

  it("returns exit 2 and prints to stderr when the input file is unreadable or malformed", async () => {
    const code = await adminBatchCommand("/this/path/definitely/does/not/exist.json");
    expect(code).toBe(2);
    expect(stderrSpy).toHaveBeenCalled();
  });
});
