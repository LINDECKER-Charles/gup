import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The interrupt flags and a failed install's output come from the runner's
 * one-slot channels: driven directly here.
 */
const { consumeMock, failureOutputMock } = vi.hoisted(() => ({
  consumeMock: vi.fn(() => ({ timedOut: false, aborted: false })),
  failureOutputMock: vi.fn((): string | undefined => undefined),
}));
vi.mock("../../../src/core/runner.js", () => ({
  consumeInterrupt: consumeMock,
  consumeFailureOutput: failureOutputMock,
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
  failureOutputMock.mockReset();
  failureOutputMock.mockReturnValue(undefined);
});

/** What the embedded terminal kept of a `brew upgrade` stopped by the build tools. */
const BREW_OUTPUT =
  "==> Upgrading symfony-cli\nError: Your Command Line Tools (CLT) does not support macOS 27.\n" +
  "You should download the Command Line Tools for Xcode 27.0.";

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

describe("finalizeOutcome on a failure the provider did not explain", () => {
  it("gives it the line of the install's output that says why", () => {
    failureOutputMock.mockReturnValueOnce(BREW_OUTPUT);
    expect(finalizeOutcome({ id: "x", success: false })).toEqual({
      id: "x",
      success: false,
      message: "Error: Your Command Line Tools (CLT) does not support macOS 27.",
    });
  });

  it("says what the provider recovered after that line", () => {
    failureOutputMock.mockReturnValueOnce("npm error code EBUSY\n");
    expect(finalizeOutcome({ id: "x", success: false, recovery: "copie restaurée" }).message).toBe(
      "npm error code EBUSY — copie restaurée",
    );
  });

  it.each([
    ["a failure the provider explained", { id: "x", success: false, message: "échec" }],
    ["a success", { id: "x", success: true }],
    ["a skip", { id: "x", success: false, skipped: true, message: "manuel" }],
  ])("leaves %s as the provider said it", (_label, outcome) => {
    failureOutputMock.mockReturnValueOnce(BREW_OUTPUT);
    expect(finalizeOutcome(outcome)).toEqual(outcome);
  });

  it("leaves an interrupt's message alone, and clears the output with the flags", () => {
    consumeMock.mockReturnValueOnce({ timedOut: true, aborted: false });
    failureOutputMock.mockReturnValueOnce(BREW_OUTPUT);
    expect(finalizeOutcome({ id: "x", success: false }).message).toBe("timeout (1200s) — install ignorée");
    expect(failureOutputMock).toHaveBeenCalledTimes(1);
  });

  it("stays bare when no sink kept the output (an install in the user's terminal)", () => {
    expect(finalizeOutcome({ id: "x", success: false })).toEqual({ id: "x", success: false });
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
  it("consumes the pending flags and the pending failure output", () => {
    discardPendingInterrupt();
    expect(consumeMock).toHaveBeenCalledTimes(1);
    expect(failureOutputMock).toHaveBeenCalledTimes(1);
  });
});
