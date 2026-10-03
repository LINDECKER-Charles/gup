import { beforeEach, describe, expect, it, vi } from "vitest";

/** The interrupt flags come from the runner's one-slot channel: driven directly here. */
const { consumeMock } = vi.hoisted(() => ({
  consumeMock: vi.fn(() => ({ timedOut: false, aborted: false })),
}));
vi.mock("../../../src/core/runner.js", () => ({
  consumeInterrupt: consumeMock,
  getInstallTimeoutSeconds: () => 1200,
}));

import {
  discardPendingInterrupt,
  finalizeOutcome,
  MANUAL_SKIP_MESSAGE,
} from "../../../src/core/update/finalize-outcome.js";

beforeEach(() => {
  consumeMock.mockReset();
  consumeMock.mockReturnValue({ timedOut: false, aborted: false });
});

describe("finalizeOutcome", () => {
  it("passes a completed outcome through untouched", () => {
    expect(finalizeOutcome({ id: "x", success: true })).toEqual({ id: "x", success: true });
  });

  it("rewrites a timed-out outcome as a non-retryable skip naming the timeout", () => {
    consumeMock.mockReturnValueOnce({ timedOut: true, aborted: false });
    expect(finalizeOutcome({ id: "x", success: false, retryable: true })).toEqual({
      id: "x",
      success: false,
      skipped: true,
      retryable: false,
      message: "timeout (1200s) — install ignorée",
    });
  });

  it("says the user skipped it, whatever the key they used", () => {
    consumeMock.mockReturnValueOnce({ timedOut: false, aborted: true });
    const out = finalizeOutcome({ id: "x", success: false, retryable: true });
    expect(out).toMatchObject({ skipped: true, retryable: false });
    expect(out.message).toBe("ignorée par l'utilisateur");
    expect(MANUAL_SKIP_MESSAGE).toBe(out.message);
  });
});

describe("discardPendingInterrupt", () => {
  it("consumes the pending flags", () => {
    discardPendingInterrupt();
    expect(consumeMock).toHaveBeenCalledTimes(1);
  });
});
