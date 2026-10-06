import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * applyUpdate is the single seam every non-elevated update goes through, so
 * what matters here is that it wires the three concerns together in the right
 * order: dispatch to the provider, normalise the outcome (finalize-outcome),
 * then log it. Both collaborators are mocked so each can be
 * asserted on its own.
 */
const { recordUpdateMock } = vi.hoisted(() => ({ recordUpdateMock: vi.fn() }));
vi.mock("../../../src/core/history/store.js", () => ({
  recordUpdate: recordUpdateMock,
}));

const { finalizeOutcomeMock } = vi.hoisted(() => ({
  finalizeOutcomeMock: vi.fn((o: unknown) => o),
}));
vi.mock("../../../src/core/update/finalize-outcome.js", () => ({
  finalizeOutcome: finalizeOutcomeMock,
}));

import { runInherit } from "../../../src/core/runner.js";
import { currentOperation } from "../../../src/core/state/run-context.js";
import type { Provider } from "../../../src/core/types.js";
import {
  applyOptionsOf,
  applyUpdate,
  REJECTION_MESSAGES,
} from "../../../src/core/update/apply-update.js";

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

describe("applyUpdate when the provider rejects", () => {
  it("records a package the runner's argv barrier refused as failed, and resolves", async () => {
    // The real barrier: a control character in argv is refused before any spawn.
    const provider = mkProvider(
      vi.fn(async () => {
        await runInherit("npm", ["install", "-g", "evil\u0007name"]);
        return { id: "evil", success: true };
      }),
    );

    const outcome = await applyUpdate(provider, "evil");

    expect(outcome).toEqual({
      id: "evil",
      success: false,
      message: REJECTION_MESSAGES.barrierRefusal("argv[2] contains a forbidden control character"),
    });
    expect(finalizeOutcomeMock).toHaveBeenCalledWith(outcome);
    expect(recordUpdateMock.mock.calls[0]![0]).toMatchObject({ providerId: "npm-global", outcome });
  });

  it("reports any other rejection as an unexpected failure", async () => {
    const provider = mkProvider(vi.fn().mockRejectedValue(new TypeError("boom")));
    await expect(applyUpdate(provider, "typescript")).resolves.toEqual({
      id: "typescript",
      success: false,
      message: REJECTION_MESSAGES.unexpectedFailure("boom"),
    });
    expect(recordUpdateMock).toHaveBeenCalledTimes(1);
  });
});

describe("applyUpdate context", () => {
  it("runs the provider under the update operation, so its commands are attributed", async () => {
    let seen: unknown;
    const provider = mkProvider(
      vi.fn(async () => {
        seen = currentOperation();
        return { id: "typescript", success: true };
      }),
    );
    await applyUpdate(provider, "typescript");
    expect(seen).toEqual({ op: "update", providerId: "npm-global", packageId: "typescript" });
    expect(currentOperation()).toBeUndefined();
  });

  it("records the schedule an attempt belongs to", async () => {
    await applyUpdate(mkProvider(), "typescript", { scheduleId: "s-1" });
    expect(recordUpdateMock.mock.calls[0]![0]).toMatchObject({ scheduleId: "s-1" });
  });
});

describe("applyOptionsOf", () => {
  it("carries a request's scan entry and schedule, and nothing it lacks", () => {
    const pkg = { id: "a", current: "1", latest: "2" };
    const request = { providerId: "p", packageId: "a", pkg, scheduleId: "s" };
    expect(applyOptionsOf(request)).toEqual({ pkg, scheduleId: "s" });
    expect(applyOptionsOf({ providerId: "p", packageId: "a" })).toEqual({});
  });
});
