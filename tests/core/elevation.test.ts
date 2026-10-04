import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

const { isElevatedMock, runInheritMock, timeoutMock } = vi.hoisted(() => ({
  isElevatedMock: vi.fn(),
  runInheritMock: vi.fn(),
  timeoutMock: vi.fn(() => 1200),
}));
vi.mock("../../src/core/runner.js", () => ({
  isElevated: isElevatedMock,
  runInherit: runInheritMock,
  getInstallTimeoutSeconds: timeoutMock,
}));

import {
  elevatedWaitMs,
  flagForElevation,
  readBatchInput,
  runElevatedBatch,
  writeBatchOutput,
} from "../../src/core/elevation.js";
import { installLogBackend } from "../../src/core/log/log.js";
import { restorePlatform, setPlatform } from "../support/platform.js";

describe("flagForElevation", () => {
  const rows = [
    { id: "gettext", current: "0.21", latest: "0.22" },
    { id: "libiconv", current: "1.16", latest: "1.17", note: "x" },
  ];

  it("routes every row to the elevated batch when the process is not elevated", async () => {
    isElevatedMock.mockResolvedValueOnce(false);
    await expect(flagForElevation(rows)).resolves.toEqual([
      { id: "gettext", current: "0.21", latest: "0.22", requiresAdmin: true },
      { id: "libiconv", current: "1.16", latest: "1.17", note: "x", requiresAdmin: true },
    ]);
  });

  it("leaves rows untouched when the process already runs elevated", async () => {
    isElevatedMock.mockResolvedValueOnce(true);
    await expect(flagForElevation(rows)).resolves.toEqual(rows);
  });

  it("does not probe elevation for an empty scan", async () => {
    await expect(flagForElevation([])).resolves.toEqual([]);
    expect(isElevatedMock).not.toHaveBeenCalled();
  });
});

/**
 * Per-test sandbox: a freshly-mkdtemp'd directory with user-scoped perms
 * (mode 0700 on POSIX, ACL-restricted on Windows). Avoids writing predictable
 * paths into the shared tmp dir and silences CodeQL's "Insecure creation of
 * file in the os temp dir" on these helper test fixtures.
 */
async function mkSandboxFile(name: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "gup-elevation-test-"));
  return join(dir, name);
}

describe("readBatchInput / writeBatchOutput", () => {
  it("rejects payloads with the wrong version", async () => {
    const tmp = await mkSandboxFile("version.json");
    await writeFile(tmp, JSON.stringify({ version: 99, targets: [] }), {
      encoding: "utf8",
      flag: "wx",
    });
    await expect(readBatchInput(tmp)).rejects.toThrow(/unsupported version 99/);
  });

  it("rejects payloads whose targets field is not a string array", async () => {
    const tmp = await mkSandboxFile("shape.json");
    await writeFile(tmp, JSON.stringify({ version: 1, targets: [1, 2, 3] }), {
      encoding: "utf8",
      flag: "wx",
    });
    await expect(readBatchInput(tmp)).rejects.toThrow(/string array/);
  });

  it("round-trips a valid input payload", async () => {
    const tmp = await mkSandboxFile("ok.json");
    await writeFile(
      tmp,
      JSON.stringify({ version: 1, targets: ["choco:nodejs", "choco:python"] }),
      { encoding: "utf8", flag: "wx" },
    );
    const parsed = await readBatchInput(tmp);
    expect(parsed.targets).toEqual(["choco:nodejs", "choco:python"]);
  });

  it("writeBatchOutput emits a version: 1 envelope around the outcomes array", async () => {
    const tmp = await mkSandboxFile("out.json");
    await writeBatchOutput(tmp, [{ id: "nodejs", success: true }]);
    const raw = await readFile(tmp, "utf8");
    expect(JSON.parse(raw)).toEqual({
      version: 1,
      outcomes: [{ id: "nodejs", success: true }],
    });
  });
});

describe("runElevatedBatch", () => {
  it("returns an empty array immediately when given no targets", async () => {
    const spawner = vi.fn();
    await expect(runElevatedBatch([], spawner)).resolves.toEqual([]);
    expect(spawner).not.toHaveBeenCalled();
  });

  it("writes the input file, invokes the spawner, and reads outcomes back", async () => {
    let observedInput = "";
    const spawner = vi.fn(async (inputFile: string) => {
      observedInput = await readFile(inputFile, "utf8");
      // Simulate the elevated child writing its outcomes next to the input.
      await writeBatchOutput(`${inputFile}.out`, [
        { id: "nodejs", success: true },
        { id: "python", success: false, message: "boom" },
      ]);
    });

    const outcomes = await runElevatedBatch(["choco:nodejs", "choco:python"], spawner);
    expect(spawner).toHaveBeenCalledExactlyOnceWith(expect.any(String), 2);
    expect(JSON.parse(observedInput)).toEqual({
      version: 1,
      targets: ["choco:nodejs", "choco:python"],
      installTimeoutSeconds: 1200,
      logThreshold: "off",
    });
    expect(outcomes).toEqual([
      { id: "nodejs", success: true },
      { id: "python", success: false, message: "boom" },
    ]);
  });

  it("surfaces a per-target failure when the spawner throws (e.g. UAC declined)", async () => {
    const spawner = vi.fn(async () => {
      throw new Error("UAC refused");
    });
    const outcomes = await runElevatedBatch(["choco:nodejs", "choco:python"], spawner);
    expect(outcomes).toEqual([
      expect.objectContaining({
        id: "nodejs",
        success: false,
        message: expect.stringContaining("UAC refused"),
      }),
      expect.objectContaining({
        id: "python",
        success: false,
        message: expect.stringContaining("UAC refused"),
      }),
    ]);
  });

  it("surfaces a per-target failure when the child wrote no readable output", async () => {
    // Spawner "succeeds" but writes nothing → output file is missing.
    const spawner = vi.fn(async () => {});
    const outcomes = await runElevatedBatch(["choco:nodejs"], spawner);
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]).toMatchObject({ id: "nodejs", success: false });
    expect(outcomes[0]!.message).toMatch(/Échec du process élevé/);
  });

  it("rejects an outcomes payload whose length differs from the requested targets", async () => {
    // The parent maps outcomes to targets by index. A length mismatch would
    // either shift the mapping or silently drop a target — surface every
    // target as a generic failure so the summary stays trustworthy.
    const spawner = vi.fn(async (inputFile: string) => {
      // Length 1 for 2 targets → mismatch.
      await writeBatchOutput(`${inputFile}.out`, [{ id: "nodejs", success: true }]);
    });
    const outcomes = await runElevatedBatch(["choco:nodejs", "choco:python"], spawner);
    expect(outcomes.map((o) => o.success)).toEqual([false, false]);
    expect(outcomes[0]!.message).toMatch(/length mismatch/);
    expect(outcomes[1]!.message).toMatch(/length mismatch/);
  });

  it("replaces a malformed outcome entry with a synthetic failure tied to the matching target", async () => {
    // Length matches but one entry is junk — keep the well-formed entry and
    // synthesise a failure for the malformed one so the summary still has
    // one row per requested target.
    const spawner = vi.fn(async (inputFile: string) => {
      const payload = {
        version: 1,
        outcomes: [{ id: "nodejs", success: true }, { not: "an outcome" }],
      };
      await writeFile(`${inputFile}.out`, JSON.stringify(payload), { encoding: "utf8" });
    });
    const outcomes = await runElevatedBatch(["choco:nodejs", "choco:python"], spawner);
    expect(outcomes[0]).toEqual({ id: "nodejs", success: true });
    expect(outcomes[1]).toMatchObject({ id: "python", success: false });
    expect(outcomes[1]!.message).toMatch(/malformed outcome/);
  });

  it("derives a usable id from a target that lacks the provider:packageId separator", async () => {
    // Defensive: even if the caller forgets to validate targets, the fallback
    // outcome should still have an id we can show to the user.
    const spawner = vi.fn(async () => {
      throw new Error("nope");
    });
    const outcomes = await runElevatedBatch(["malformed-target"], spawner);
    expect(outcomes[0]!.id).toBe("malformed-target");
  });
});

describe("elevated log bridge", () => {
  const childRecord = (event: string) =>
    JSON.stringify({ v: 1, ts: "2026-10-03T12:00:00.000Z", level: "info", event, runId: "child", pid: 7 });

  it("writes the child's log next to its outcomes only when there is one", async () => {
    const withLog = await mkSandboxFile("with-log.json");
    await writeBatchOutput(withLog, [{ id: "git", success: true }], [childRecord("cmd.end")]);
    expect(JSON.parse(await readFile(withLog, "utf8"))).toEqual({
      version: 1,
      outcomes: [{ id: "git", success: true }],
      log: [childRecord("cmd.end")],
    });
    const withoutLog = await mkSandboxFile("without-log.json");
    await writeBatchOutput(withoutLog, [{ id: "git", success: true }], []);
    expect(JSON.parse(await readFile(withoutLog, "utf8"))).not.toHaveProperty("log");
  });

  it("forwards the child's records to this process's log, whatever the outcomes say", async () => {
    const forward = vi.fn();
    installLogBackend({ isEnabled: () => true, emit: () => {}, forward });
    try {
      const good = await runElevatedBatch(["choco:git"], async (inputFile) => {
        await writeBatchOutput(`${inputFile}.out`, [{ id: "git", success: true }], [
          childRecord("update.start"),
          "garbage",
        ]);
      });
      expect(good).toEqual([{ id: "git", success: true }]);
      const mismatched = await runElevatedBatch(["choco:git", "choco:7zip"], async (inputFile) => {
        await writeBatchOutput(`${inputFile}.out`, [{ id: "git", success: true }], [childRecord("cmd.end")]);
      });
      expect(mismatched.every((outcome) => !outcome.success)).toBe(true);
      expect(forward.mock.calls.map(([record]) => (record as { event: string }).event)).toEqual([
        "update.start",
        "cmd.end",
      ]);
    } finally {
      installLogBackend(null);
    }
  });

  it("never lets a malformed log change the outcomes", async () => {
    const outcomes = await runElevatedBatch(["choco:git"], async (inputFile) => {
      await writeFile(
        `${inputFile}.out`,
        JSON.stringify({ version: 1, outcomes: [{ id: "git", success: true }], log: { not: "a list" } }),
        { encoding: "utf8", flag: "wx" },
      );
    });
    expect(outcomes).toEqual([{ id: "git", success: true }]);
  });
});

describe("elevated child settings (payload)", () => {
  async function payloadFile(content: unknown): Promise<string> {
    const file = await mkSandboxFile("settings.json");
    await writeFile(file, JSON.stringify(content), { encoding: "utf8", flag: "wx" });
    return file;
  }

  it("hands the child the parent's effective timeout and log threshold", async () => {
    timeoutMock.mockReturnValue(600);
    installLogBackend({ isEnabled: (level) => level !== "trace", emit: () => {} });
    try {
      let payload: unknown;
      await runElevatedBatch(["choco:nodejs"], async (inputFile) => {
        payload = JSON.parse(await readFile(inputFile, "utf8"));
      });
      expect(payload).toMatchObject({ installTimeoutSeconds: 600, logThreshold: "debug" });
    } finally {
      installLogBackend(null);
      timeoutMock.mockReturnValue(1200);
    }
  });

  it("caps a timeout beyond what the payload carries at one day", async () => {
    timeoutMock.mockReturnValue(1_000_000);
    try {
      let payload: { installTimeoutSeconds?: number } = {};
      await runElevatedBatch(["choco:nodejs"], async (inputFile) => {
        payload = JSON.parse(await readFile(inputFile, "utf8"));
      });
      expect(payload.installTimeoutSeconds).toBe(86_400);
    } finally {
      timeoutMock.mockReturnValue(1200);
    }
  });

  it("accepts the optional settings and a payload without them", async () => {
    const full = { version: 1, targets: ["a:b"], installTimeoutSeconds: 0, logThreshold: "trace" };
    await expect(readBatchInput(await payloadFile(full))).resolves.toEqual(full);
    await expect(readBatchInput(await payloadFile({ version: 1, targets: [] }))).resolves.toEqual({
      version: 1,
      targets: [],
    });
  });

  it.each([
    [{ installTimeoutSeconds: -1 }, /installTimeoutSeconds/],
    [{ installTimeoutSeconds: 86_401 }, /installTimeoutSeconds/],
    [{ installTimeoutSeconds: 1.5 }, /installTimeoutSeconds/],
    [{ logThreshold: "verbose" }, /logThreshold/],
  ])("refuses settings the parent never writes: %j", async (settings, error) => {
    const file = await payloadFile({ version: 1, targets: [], ...settings });
    await expect(readBatchInput(file)).rejects.toThrow(error);
  });
});

describe("elevated wait", () => {
  it("gives every package the full install timeout, plus time to accept the prompt", () => {
    expect(elevatedWaitMs(1, 1200)).toBe(1_200_000 + 300_000);
    expect(elevatedWaitMs(4, 1200)).toBe(4 * 1_200_000 + 300_000);
  });

  it("does not limit the wait when the install timeout is off", () => {
    expect(elevatedWaitMs(10, 0)).toBe(0);
  });

  it.each([
    ["win32", "powershell.exe"],
    ["linux", "sudo"],
  ] as const)("waits for the %s elevated child as long as its batch needs", async (platform, command) => {
    setPlatform(platform);
    runInheritMock.mockReset();
    runInheritMock.mockResolvedValue({ stdout: "", stderr: "", exitCode: 0, failed: false });
    try {
      await runElevatedBatch(["choco:a", "choco:b", "choco:c"]);
    } finally {
      restorePlatform();
    }
    const [spawned, , options] = runInheritMock.mock.calls[0]!;
    expect(spawned).toBe(command);
    expect(options).toEqual({ timeout: 3 * 1_200_000 + 300_000 });
  });
});
