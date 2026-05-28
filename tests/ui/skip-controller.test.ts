import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * skip-controller is a thin layer over runner.ts (the SIGINT plumbing) — mock
 * runner so we can drive the interrupt flags and the skip lever deterministically.
 */
const { consumeMock, timeoutMock, skipMock } = vi.hoisted(() => ({
  consumeMock: vi.fn(() => ({ timedOut: false, aborted: false })),
  timeoutMock: vi.fn(() => 1200),
  skipMock: vi.fn(() => false),
}));

vi.mock("../../src/core/runner.js", () => ({
  consumeInterrupt: consumeMock,
  getInstallTimeoutSeconds: timeoutMock,
  skipCurrent: skipMock,
}));

import {
  beginSkipSession,
  discardPendingInterrupt,
  finalizeOutcome,
} from "../../src/ui/skip-controller.js";

let writeSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  consumeMock.mockReturnValue({ timedOut: false, aborted: false });
  timeoutMock.mockReturnValue(1200);
  skipMock.mockReturnValue(false);
  writeSpy = vi.spyOn(process.stdout, "write").mockReturnValue(true);
});

afterEach(() => {
  writeSpy.mockRestore();
  vi.clearAllMocks();
});

describe("finalizeOutcome", () => {
  it("passes a completed outcome through untouched", () => {
    expect(finalizeOutcome({ id: "x", success: true })).toEqual({
      id: "x",
      success: true,
    });
  });

  it("rewrites a timed-out outcome as a non-retryable skip", () => {
    consumeMock.mockReturnValueOnce({ timedOut: true, aborted: false });
    const out = finalizeOutcome({ id: "x", success: false, retryable: true });
    expect(out).toMatchObject({
      id: "x",
      success: false,
      skipped: true,
      retryable: false,
    });
    expect(out.message).toContain("timeout");
  });

  it("rewrites a manually-aborted outcome as a skip (Ctrl+C)", () => {
    consumeMock.mockReturnValueOnce({ timedOut: false, aborted: true });
    const out = finalizeOutcome({ id: "x", success: false, retryable: true });
    expect(out).toMatchObject({ skipped: true, retryable: false });
    expect(out.message).toContain("Ctrl+C");
  });
});

describe("discardPendingInterrupt", () => {
  it("consumes the pending flags", () => {
    discardPendingInterrupt();
    expect(consumeMock).toHaveBeenCalledTimes(1);
  });
});

describe("beginSkipSession", () => {
  it("installs a SIGINT handler and removes it on dispose", () => {
    const onSpy = vi.spyOn(process, "on");
    const offSpy = vi.spyOn(process, "removeListener");
    const session = beginSkipSession();
    const sigint = onSpy.mock.calls.find((c) => c[0] === "SIGINT");
    expect(sigint).toBeDefined();
    expect(session.isAbortRequested()).toBe(false);
    session.dispose();
    expect(offSpy).toHaveBeenCalledWith("SIGINT", sigint![1]);
    onSpy.mockRestore();
    offSpy.mockRestore();
  });

  it("single Ctrl+C skips the current install without requesting abort", () => {
    skipMock.mockReturnValue(true);
    const onSpy = vi.spyOn(process, "on");
    const session = beginSkipSession();
    const handler = onSpy.mock.calls.find((c) => c[0] === "SIGINT")![1] as () => void;
    handler();
    expect(skipMock).toHaveBeenCalledTimes(1);
    expect(session.isAbortRequested()).toBe(false);
    session.dispose();
    onSpy.mockRestore();
  });

  it("double Ctrl+C within the window requests a full abort", () => {
    skipMock.mockReturnValue(true);
    const onSpy = vi.spyOn(process, "on");
    const session = beginSkipSession();
    const handler = onSpy.mock.calls.find((c) => c[0] === "SIGINT")![1] as () => void;
    handler();
    handler();
    expect(session.isAbortRequested()).toBe(true);
    session.dispose();
    onSpy.mockRestore();
  });

  it("Ctrl+C with no install in flight requests abort", () => {
    skipMock.mockReturnValue(false);
    const onSpy = vi.spyOn(process, "on");
    const session = beginSkipSession();
    const handler = onSpy.mock.calls.find((c) => c[0] === "SIGINT")![1] as () => void;
    handler();
    expect(session.isAbortRequested()).toBe(true);
    session.dispose();
    onSpy.mockRestore();
  });
});
