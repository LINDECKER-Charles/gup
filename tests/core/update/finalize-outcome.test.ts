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
  INTERRUPT_MESSAGES,
  isManualSkip,
  skippedAs,
} from "../../../src/core/update/finalize-outcome.js";
import { useLocale } from "../../support/locale.js";

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
    expect(INTERRUPT_MESSAGES.manualSkip).toBe(out.message);
  });

  // npm-g moves back the copy a killed npm left aside: the user must read it
  // whatever ended the install, though the interrupt rewrites the message.
  it.each([
    [{ timedOut: true, aborted: false }, "timeout (1200s) — install ignorée — copie restaurée"],
    [{ timedOut: false, aborted: true }, "ignorée par l'utilisateur — copie restaurée"],
    [{ timedOut: false, aborted: false }, "échec — copie restaurée"],
  ])("says what the provider recovered after the message (%o)", (flags, message) => {
    consumeMock.mockReturnValueOnce(flags);
    const out = finalizeOutcome({
      id: "x",
      success: false,
      message: "échec",
      recovery: "copie restaurée",
    });
    expect(out.message).toBe(message);
  });

  it("makes the recovery note the message of a failure that had none", () => {
    expect(finalizeOutcome({ id: "x", success: false, recovery: "copie restaurée" })).toEqual({
      id: "x",
      success: false,
      message: "copie restaurée",
      recovery: "copie restaurée",
    });
  });
});

describe("isManualSkip / skippedAs", () => {
  it("recognise the user's skip, recovery note included, and reword it", () => {
    consumeMock.mockReturnValueOnce({ timedOut: false, aborted: true });
    const skipped = finalizeOutcome({ id: "x", success: false, recovery: "copie restaurée" });
    expect(isManualSkip(skipped)).toBe(true);
    expect(isManualSkip({ ...skipped, message: "timeout" })).toBe(false);
    expect(skippedAs(skipped, "interrompu").message).toBe("interrompu — copie restaurée");
  });

  describe("in English", () => {
    useLocale("en");

    it("words the timeout and the user's skip in English, and still recognises the skip", () => {
      consumeMock.mockReturnValueOnce({ timedOut: true, aborted: false });
      expect(finalizeOutcome({ id: "x", success: false }).message).toBe(
        "timeout (1200s) — install skipped",
      );
      consumeMock.mockReturnValueOnce({ timedOut: false, aborted: true });
      const skipped = finalizeOutcome({ id: "x", success: false, recovery: "copy restored" });
      expect(skipped.message).toBe("skipped by the user — copy restored");
      expect(isManualSkip(skipped)).toBe(true);
    });
  });
});

describe("discardPendingInterrupt", () => {
  it("consumes the pending flags", () => {
    discardPendingInterrupt();
    expect(consumeMock).toHaveBeenCalledTimes(1);
  });
});
