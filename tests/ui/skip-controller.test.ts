import { stripVTControlCharacters } from "node:util";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * skip-controller is a thin layer over runner.ts (the SIGINT plumbing) — mock
 * runner so we can drive the interrupt flags and the skip lever deterministically.
 */
const { timeoutMock, skipMock } = vi.hoisted(() => ({
  timeoutMock: vi.fn(() => 1200),
  skipMock: vi.fn(() => false),
}));

vi.mock("../../src/core/runner.js", () => ({
  getInstallTimeoutSeconds: timeoutMock,
  skipCurrent: skipMock,
}));

import { beginSkipSession, CTRL_C_DOUBLE_PRESS_MS } from "../../src/ui/skip-controller.js";

let writeSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  timeoutMock.mockReturnValue(1200);
  skipMock.mockReturnValue(false);
  writeSpy = vi.spyOn(process.stdout, "write").mockReturnValue(true);
});

afterEach(() => {
  writeSpy.mockRestore();
  vi.clearAllMocks();
});

/** What the session printed when it began, without colour, one entry per line. */
function hintLines(columns: number | undefined): string[] {
  const descriptor = Object.getOwnPropertyDescriptor(process.stdout, "columns");
  Object.defineProperty(process.stdout, "columns", { value: columns, configurable: true });
  try {
    beginSkipSession().dispose();
  } finally {
    if (descriptor) Object.defineProperty(process.stdout, "columns", descriptor);
    else delete (process.stdout as { columns?: number }).columns;
  }
  const printed = writeSpy.mock.calls.map((call: readonly unknown[]) => String(call[0])).join("");
  return stripVTControlCharacters(printed).split("\n").filter(Boolean);
}

describe("the keys' hint printed as the batch starts", () => {
  it("keeps within an 80-column terminal, broken between two keys rather than in a word", () => {
    timeoutMock.mockReturnValue(600);
    const lines = hintLines(80);
    expect(lines).toEqual([
      "  Ctrl+C : passer l'install bloquée · Ctrl+C ×2 : tout arrêter",
      "  timeout auto 600s",
    ]);
  });

  it("stays on one line when the terminal is wide enough, and within 80 columns piped", () => {
    timeoutMock.mockReturnValue(0);
    expect(hintLines(120)).toEqual([
      "  Ctrl+C : passer l'install bloquée · Ctrl+C ×2 : tout arrêter · timeout auto désactivé",
    ]);
    writeSpy.mockClear();
    expect(hintLines(undefined).every((line) => line.length <= 80)).toBe(true);
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

  it("two Ctrl+C further apart than the window only skip, twice", () => {
    vi.useFakeTimers();
    try {
      skipMock.mockReturnValue(true);
      const onSpy = vi.spyOn(process, "on");
      const session = beginSkipSession();
      const handler = onSpy.mock.calls.find((c) => c[0] === "SIGINT")![1] as () => void;
      handler();
      vi.advanceTimersByTime(CTRL_C_DOUBLE_PRESS_MS + 1);
      handler();
      expect(session.isAbortRequested()).toBe(false);
      expect(skipMock).toHaveBeenCalledTimes(2);
      session.dispose();
      onSpy.mockRestore();
    } finally {
      vi.useRealTimers();
    }
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
