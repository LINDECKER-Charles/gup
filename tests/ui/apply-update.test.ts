import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * applyUpdate is the single seam every non-elevated update goes through, so
 * what matters here is that it wires the three concerns together in the right
 * order: dispatch to the provider, normalise the outcome through the skip
 * controller, then log it. Both collaborators are mocked so each can be
 * asserted on its own.
 */
const { recordUpdateMock } = vi.hoisted(() => ({ recordUpdateMock: vi.fn() }));
vi.mock("../../src/core/history/store.js", () => ({
  recordUpdate: recordUpdateMock,
}));

const { finalizeOutcomeMock } = vi.hoisted(() => ({
  finalizeOutcomeMock: vi.fn((o: unknown) => o),
}));
vi.mock("../../src/ui/skip-controller.js", () => ({
  finalizeOutcome: finalizeOutcomeMock,
}));

import { applyEach, applyUpdate } from "../../src/ui/apply-update.js";
import type { Provider } from "../../src/core/types.js";

function mkProvider(update = vi.fn().mockResolvedValue({ id: "x", success: true })) {
  return {
    id: "npm-global",
    displayName: "npm (global)",
    isAvailable: vi.fn().mockResolvedValue(true),
    listOutdated: vi.fn().mockResolvedValue([]),
    update,
    updateAll: vi.fn().mockResolvedValue([]),
  } as unknown as Provider & { update: ReturnType<typeof vi.fn> };
}

beforeEach(() => {
  recordUpdateMock.mockReset();
  finalizeOutcomeMock.mockReset();
  finalizeOutcomeMock.mockImplementation((o: unknown) => o);
});

describe("applyUpdate", () => {
  it("dispatches with the package id alone when no provider option applies", async () => {
    const provider = mkProvider();
    await applyUpdate(provider, "typescript");
    expect(provider.update).toHaveBeenCalledWith("typescript");
  });

  it("returns the finalized outcome, not the provider's raw one", async () => {
    const raw = { id: "typescript", success: false };
    const finalized = { id: "typescript", success: false, skipped: true };
    finalizeOutcomeMock.mockReturnValueOnce(finalized);

    const provider = mkProvider(vi.fn().mockResolvedValue(raw));
    await expect(applyUpdate(provider, "typescript")).resolves.toBe(finalized);
    expect(finalizeOutcomeMock).toHaveBeenCalledWith(raw);
  });

  it("logs the finalized outcome with the provider id and a duration", async () => {
    const provider = mkProvider();
    await applyUpdate(provider, "typescript");

    expect(recordUpdateMock).toHaveBeenCalledTimes(1);
    const record = recordUpdateMock.mock.calls[0]![0];
    expect(record).toMatchObject({
      providerId: "npm-global",
      outcome: { id: "x", success: true },
    });
    expect(record.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("forwards provider options and tags the record as a retry", async () => {
    const provider = mkProvider();
    await applyUpdate(provider, "Foo.Bar", {
      update: { force: true },
      retry: "retry --force",
    });

    expect(provider.update).toHaveBeenCalledWith("Foo.Bar", { force: true });
    expect(recordUpdateMock.mock.calls[0]![0]).toMatchObject({
      retry: "retry --force",
    });
  });

  it("passes the scan entry through so the record carries from/to", async () => {
    const pkg = { id: "typescript", current: "5.0.0", latest: "5.1.0" };
    await applyUpdate(mkProvider(), "typescript", { pkg });
    expect(recordUpdateMock.mock.calls[0]![0]).toMatchObject({ pkg });
  });
});

describe("applyEach", () => {
  const never = { isAbortRequested: () => false };

  it("updates every package in order and logs one record each", async () => {
    const provider = mkProvider();
    const packages = [
      { id: "a", current: "1", latest: "2" },
      { id: "b", current: "1", latest: "2" },
    ];

    const outcomes = await applyEach(provider, packages, never);

    expect(outcomes).toHaveLength(2);
    expect(provider.update.mock.calls.map((c) => c[0])).toEqual(["a", "b"]);
    expect(recordUpdateMock).toHaveBeenCalledTimes(2);
  });

  it("stops before the next package once the batch is aborted", async () => {
    const provider = mkProvider();
    let calls = 0;
    const session = { isAbortRequested: () => calls++ > 0 };

    const outcomes = await applyEach(
      provider,
      [{ id: "a", current: "1", latest: "2" }, { id: "b", current: "1", latest: "2" }],
      session,
    );

    expect(outcomes).toHaveLength(1);
    expect(provider.update).toHaveBeenCalledTimes(1);
  });
});
