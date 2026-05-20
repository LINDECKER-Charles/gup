import { readFile, writeFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";

import {
  readBatchInput,
  runElevatedBatch,
  writeBatchOutput,
} from "../../src/core/elevation.js";

describe("readBatchInput / writeBatchOutput", () => {
  it("rejects payloads with the wrong version", async () => {
    const tmp = `${process.env.TEMP || "/tmp"}/gup-elevation-test-${Date.now()}-version.json`;
    await writeFile(tmp, JSON.stringify({ version: 99, targets: [] }), { encoding: "utf8" });
    await expect(readBatchInput(tmp)).rejects.toThrow(/unsupported version 99/);
  });

  it("rejects payloads whose targets field is not a string array", async () => {
    const tmp = `${process.env.TEMP || "/tmp"}/gup-elevation-test-${Date.now()}-shape.json`;
    await writeFile(tmp, JSON.stringify({ version: 1, targets: [1, 2, 3] }), { encoding: "utf8" });
    await expect(readBatchInput(tmp)).rejects.toThrow(/string array/);
  });

  it("round-trips a valid input payload", async () => {
    const tmp = `${process.env.TEMP || "/tmp"}/gup-elevation-test-${Date.now()}-ok.json`;
    await writeFile(
      tmp,
      JSON.stringify({ version: 1, targets: ["choco:nodejs", "choco:python"] }),
      { encoding: "utf8" },
    );
    const parsed = await readBatchInput(tmp);
    expect(parsed.targets).toEqual(["choco:nodejs", "choco:python"]);
  });

  it("writeBatchOutput emits a version: 1 envelope around the outcomes array", async () => {
    const tmp = `${process.env.TEMP || "/tmp"}/gup-elevation-test-${Date.now()}-out.json`;
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
    expect(spawner).toHaveBeenCalledOnce();
    expect(JSON.parse(observedInput)).toEqual({
      version: 1,
      targets: ["choco:nodejs", "choco:python"],
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
